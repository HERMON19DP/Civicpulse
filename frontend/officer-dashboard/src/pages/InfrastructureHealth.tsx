import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowsClockwise,
  ArrowUpRight,
  Buildings,
  CaretDown,
  CheckCircle,
  ClockCounterClockwise,
  Crosshair,
  Drop,
  Gauge,
  GlobeHemisphereEast,
  Heartbeat,
  Lightbulb,
  MagnifyingGlass,
  MapPin,
  Minus,
  Plus,
  RoadHorizon,
  Robot,
  ShareNetwork,
  ShieldCheck,
  SlidersHorizontal,
  Trash,
  TrendDown,
  TrendUp,
  WarningCircle,
  Waves,
  Wrench,
  X,
} from "@phosphor-icons/react";
import {
  ExpandableFilterBar,
  type ActiveFilterChip,
} from "../components/ExpandableFilterBar";
import AssetLocationPicker from "../components/spatial/AssetLocationPicker";
import { api } from "../api/client";
import type { ActiveCitiesResponse } from "../types/spatial";
import type {
  AssetDetailsResponse,
  AssetType,
  HealthGrade,
  HealthHistoryPoint,
  HealthTrend,
  InfrastructureAsset,
  InfrastructureMetricsResponse,
  InfrastructureOverviewResponse,
  MaintenanceEventType,
  MaintenanceOutcome,
  WardHealthItem,
} from "../types/infrastructure";

type ViewMode = "assets" | "wards";

const ASSET_TYPE_OPTIONS: Array<{
  value: "all" | AssetType;
  label: string;
  shortLabel: string;
}> = [
  { value: "all", label: "All Asset Types", shortLabel: "All Types" },
  { value: "ROAD_SEGMENT", label: "Road Segments", shortLabel: "Roads" },
  {
    value: "WATER_PIPELINE",
    label: "Water Pipelines",
    shortLabel: "Water Pipelines",
  },
  { value: "DRAINAGE", label: "Drainage Networks", shortLabel: "Drainage" },
  {
    value: "STREETLIGHT_CLUSTER",
    label: "Streetlight Clusters",
    shortLabel: "Streetlights",
  },
  { value: "WASTE_POINT", label: "Waste Points", shortLabel: "Waste Points" },
];

const GRADE_OPTIONS: Array<"all" | HealthGrade> = [
  "all",
  "CRITICAL",
  "POOR",
  "FAIR",
  "GOOD",
];

const SORT_OPTIONS = [
  { value: "lowest_health", label: "Lowest Health First" },
  { value: "highest_health", label: "Highest Health First" },
  { value: "most_complaints", label: "Most Complaints" },
  { value: "oldest_maintenance", label: "Longest Unmaintained" },
  { value: "ward", label: "Ward (A–Z)" },
];

const MAINTENANCE_TYPES: Array<{ value: MaintenanceEventType; label: string }> =
  [
    { value: "INSPECTION", label: "Field Inspection" },
    { value: "REPAIR", label: "Corrective Repair" },
    { value: "RESURFACING", label: "Resurfacing / Rehabilitation" },
    { value: "REPLACEMENT", label: "Component Replacement" },
    { value: "CLEANING", label: "Desilting / Cleaning" },
    { value: "PREVENTIVE_MAINTENANCE", label: "Preventive Maintenance" },
  ];

const MAINTENANCE_OUTCOMES: Array<{
  value: MaintenanceOutcome;
  label: string;
}> = [
  { value: "COMPLETED", label: "Completed (Resets maintenance clock)" },
  { value: "PARTIAL", label: "Partial Work" },
  { value: "DEFERRED", label: "Deferred / Scheduled" },
  { value: "FAILED_INSPECTION", label: "Failed Inspection" },
];

/** Default initial map centre — used only before the officer picks a location */
const DEFAULT_MAP_CENTER = { latitude: 13.0418, longitude: 80.2341 }; // Chennai GCC centre

function getGradeTheme(grade: HealthGrade) {
  switch (grade) {
    case "CRITICAL":
      return {
        badge: "border-rose-300 bg-rose-500/15 text-rose-800",
        ringStroke: "#e11d48",
        ringTrack: "rgba(225, 29, 72, 0.14)",
        barFill: "bg-gradient-to-r from-rose-500 to-red-600",
        text: "text-rose-700",
        softBg: "bg-rose-50/75 border-rose-200/80",
      };
    case "POOR":
      return {
        badge: "border-amber-300 bg-amber-500/15 text-amber-900",
        ringStroke: "#d97706",
        ringTrack: "rgba(217, 119, 6, 0.14)",
        barFill: "bg-gradient-to-r from-amber-500 to-orange-500",
        text: "text-amber-700",
        softBg: "bg-amber-50/70 border-amber-200/80",
      };
    case "FAIR":
      return {
        badge: "border-sky-300 bg-sky-500/15 text-sky-900",
        ringStroke: "#0284c7",
        ringTrack: "rgba(2, 132, 199, 0.14)",
        barFill: "bg-gradient-to-r from-sky-500 to-blue-600",
        text: "text-sky-700",
        softBg: "bg-sky-50/70 border-sky-200/80",
      };
    default:
      return {
        badge: "border-emerald-300 bg-emerald-500/15 text-emerald-800",
        ringStroke: "#059669",
        ringTrack: "rgba(5, 150, 105, 0.14)",
        barFill: "bg-gradient-to-r from-emerald-500 to-teal-600",
        text: "text-emerald-700",
        softBg: "bg-emerald-50/70 border-emerald-200/80",
      };
  }
}

function getAssetTypeIcon(assetType: AssetType) {
  switch (assetType) {
    case "ROAD_SEGMENT":
      return RoadHorizon;
    case "WATER_PIPELINE":
      return Drop;
    case "DRAINAGE":
      return Waves;
    case "STREETLIGHT_CLUSTER":
      return Lightbulb;
    case "WASTE_POINT":
      return Trash;
    default:
      return Buildings;
  }
}

function getTrendBadge(trend: HealthTrend) {
  if (trend === "DETERIORATING") {
    return {
      label: "Deteriorating",
      cls: "border-rose-200 bg-rose-50 text-rose-700",
      icon: TrendDown,
    };
  }
  if (trend === "IMPROVING") {
    return {
      label: "Improving",
      cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: TrendUp,
    };
  }
  return {
    label: "Stable",
    cls: "border-slate-200 bg-slate-100/80 text-slate-700",
    icon: Minus,
  };
}

function formatMaintenanceAge(months: number | null | undefined): string {
  if (months == null || !Number.isFinite(months)) return "Unrecorded";
  if (months < 1) return "< 1 mo ago";
  if (months < 12) return `${months.toFixed(1).replace(/\.0$/, "")} mo ago`;
  const years = (months / 12).toFixed(1).replace(/\.0$/, "");
  return `${years} yr (${Math.round(months)} mo)`;
}

function formatDateShort(iso?: string | null): string {
  if (!iso) return "Not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not recorded";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function HealthScoreRing({
  score,
  grade,
  size = 54,
  strokeWidth = 5,
}: {
  score: number;
  grade: HealthGrade;
  size?: number;
  strokeWidth?: number;
}) {
  const theme = getGradeTheme(grade);
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={`Health score ${clamped} out of 100 (${grade})`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.ringTrack}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.ringStroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <span
        className={`absolute font-mono font-extrabold ${
          size >= 70 ? "text-xl" : "text-sm"
        } ${theme.text}`}
      >
        {clamped}
      </span>
    </div>
  );
}

function HealthHistorySparkline({
  history,
}: {
  history: HealthHistoryPoint[];
}) {
  const sorted = [...history]
    .sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    )
    .slice(-10);

  if (sorted.length < 2) {
    return null;
  }

  const width = 320;
  const height = 64;
  const padX = 14;
  const padY = 10;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  const points = sorted.map((pt, idx) => {
    const x =
      sorted.length === 1
        ? width / 2
        : padX + (idx / (sorted.length - 1)) * usableW;
    const clampedScore = Math.max(0, Math.min(100, pt.healthScore));
    const y = padY + (1 - clampedScore / 100) * usableH;
    return { x, y, pt };
  });

  const polylinePts = points
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const lastPt = points[points.length - 1];
  const strokeColor = getGradeTheme(lastPt.pt.healthGrade).ringStroke;

  return (
    <div className="mb-2.5 rounded-xl border border-white/80 bg-white/75 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-ink-soft">
        <span>Trajectory ({sorted.length} snapshots)</span>
        <span className="font-mono text-ink">
          {Math.round(sorted[0].healthScore)} →{" "}
          {Math.round(lastPt.pt.healthScore)} pts
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-14 w-full overflow-visible"
        role="img"
        aria-label="Infrastructure health trajectory chart"
      >
        <line
          x1={padX}
          y1={padY + usableH * 0.2}
          x2={width - padX}
          y2={padY + usableH * 0.2}
          stroke="rgba(16,185,129,0.22)"
          strokeDasharray="3 3"
        />
        <line
          x1={padX}
          y1={padY + usableH * 0.6}
          x2={width - padX}
          y2={padY + usableH * 0.6}
          stroke="rgba(225,29,72,0.22)"
          strokeDasharray="3 3"
        />
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylinePts}
        />
        {points.map(({ x, y, pt }) => (
          <circle
            key={pt.id}
            cx={x}
            cy={y}
            r={3.5}
            fill={getGradeTheme(pt.healthGrade).ringStroke}
            stroke="#ffffff"
            strokeWidth={1.5}
          >
            <title>
              {pt.healthScore}/100 ({pt.healthGrade}) ·{" "}
              {formatDateShort(pt.recordedAt)}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export default function InfrastructureHealth() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAssetId = searchParams.get("assetId");
  const initialCity = searchParams.get("city") || "all";
  const initialWard = searchParams.get("ward") || "all";

  const [viewMode, setViewMode] = useState<ViewMode>("assets");
  const [selectedCity, setSelectedCity] = useState<string>(initialCity);
  const [selectedWard, setSelectedWard] = useState<string>(initialWard);
  const [assetTypeFilter, setAssetTypeFilter] = useState<"all" | AssetType>(
    "all",
  );
  const [gradeFilter, setGradeFilter] = useState<"all" | HealthGrade>("all");
  const [conditionFilter, setConditionFilter] = useState<
    "all" | "deteriorating" | "overdue" | "cross_impact"
  >("all");
  const [minOpenIssues, setMinOpenIssues] = useState<number>(0);
  const [sortBy, setSortBy] = useState<string>("lowest_health");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);

  const [citiesData, setCitiesData] = useState<ActiveCitiesResponse | null>(
    null,
  );
  const [overview, setOverview] =
    useState<InfrastructureOverviewResponse | null>(null);
  const [infraMetrics, setInfraMetrics] =
    useState<InfrastructureMetricsResponse | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(
    initialAssetId,
  );
  const [assetDetails, setAssetDetails] = useState<AssetDetailsResponse | null>(
    null,
  );

  const overviewReqSeq = useRef(0);
  const detailsReqSeq = useRef(0);
  const filtersRef = useRef({
    selectedCity,
    selectedWard,
    assetTypeFilter,
    gradeFilter,
    sortBy,
  });
  filtersRef.current = {
    selectedCity,
    selectedWard,
    assetTypeFilter,
    gradeFilter,
    sortBy,
  };

  const [loading, setLoading] = useState<boolean>(true);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [recomputing, setRecomputing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Progressive disclosure toggles
  const [formulaOpen, setFormulaOpen] = useState<boolean>(false);
  const [complaintsOpen, setComplaintsOpen] = useState<boolean>(true);
  const [maintenanceOpen, setMaintenanceOpen] = useState<boolean>(true);
  const [showLogMaintenanceForm, setShowLogMaintenanceForm] =
    useState<boolean>(false);

  // Maintenance form state
  const [maintType, setMaintType] =
    useState<MaintenanceEventType>("INSPECTION");
  const [maintOutcome, setMaintOutcome] =
    useState<MaintenanceOutcome>("COMPLETED");
  const [maintPerformedBy, setMaintPerformedBy] = useState<string>("");
  const [maintNotes, setMaintNotes] = useState<string>("");
  const [savingMaint, setSavingMaint] = useState<boolean>(false);
  const [maintError, setMaintError] = useState<string | null>(null);

  // Register Asset Modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newAssetCode, setNewAssetCode] = useState<string>("");
  const [newAssetName, setNewAssetName] = useState<string>("");
  const [newAssetType, setNewAssetType] = useState<AssetType>("ROAD_SEGMENT");
  const [newAssetAddress, setNewAssetAddress] = useState<string>("");
  const [newAssetRadius, setNewAssetRadius] = useState<string>("250");
  const [newAssetLastMaint, setNewAssetLastMaint] = useState<string>("");
  const [creatingAsset, setCreatingAsset] = useState<boolean>(false);
  const [createAssetError, setCreateAssetError] = useState<string | null>(null);

  // Map picker state (source of truth for location)
  const [pickedLocation, setPickedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Administrative geography resolution state
  const [geoResolving, setGeoResolving] = useState<boolean>(false);
  const [resolvedGeo, setResolvedGeo] = useState<{
    city: string | null;
    ward: string | null;
    zone: string | null;
    wardId: string | null;
    zoneId: string | null;
    municipalityId: string | null;
    boundaryVersionId: string | null;
    resolved: boolean;
  } | null>(null);
  const [geoResolveError, setGeoResolveError] = useState<string | null>(null);
  // Track the latest resolution request to discard stale responses
  const geoResolveSeq = useRef(0);

  async function loadCities() {
    try {
      const res = await api.getSpatialCities();
      setCitiesData(res);
    } catch {
      // Optional; falls back cleanly to cities discovered in overview
    }
  }

  async function loadAssetDetails(assetId: string) {
    const seq = ++detailsReqSeq.current;
    setLoadingDetails(true);
    try {
      const details = await api.getInfrastructureAsset(assetId);
      if (seq === detailsReqSeq.current) {
        setAssetDetails(details);
      }
    } catch (err) {
      if (seq === detailsReqSeq.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load infrastructure asset details.",
        );
      }
    } finally {
      if (seq === detailsReqSeq.current) {
        setLoadingDetails(false);
      }
    }
  }

  async function loadOverview(preferredAssetId?: string | null) {
    const seq = ++overviewReqSeq.current;
    const activeFilters = filtersRef.current;
    setLoading(true);
    setError(null);
    try {
      const [data, metricsRes] = await Promise.all([
        api.getInfrastructureHealth({
          city:
            activeFilters.selectedCity !== "all"
              ? activeFilters.selectedCity
              : undefined,
          ward:
            activeFilters.selectedWard !== "all"
              ? activeFilters.selectedWard
              : undefined,
          assetType:
            activeFilters.assetTypeFilter !== "all"
              ? activeFilters.assetTypeFilter
              : undefined,
          grade:
            activeFilters.gradeFilter !== "all"
              ? activeFilters.gradeFilter
              : undefined,
          sortBy: activeFilters.sortBy,
          limit: 100,
        }),
        api
          .getInfrastructureMetrics(
            activeFilters.selectedCity !== "all"
              ? activeFilters.selectedCity
              : undefined,
          )
          .catch(() => null),
      ]);

      if (seq !== overviewReqSeq.current) return;
      setOverview(data);
      setInfraMetrics(metricsRes);

      const targetId =
        preferredAssetId && data.assets.some((a) => a.id === preferredAssetId)
          ? preferredAssetId
          : selectedAssetId && data.assets.some((a) => a.id === selectedAssetId)
            ? selectedAssetId
            : (data.assets[0]?.id ?? null);

      setSelectedAssetId(targetId);
      if (targetId) {
        await loadAssetDetails(targetId);
      } else {
        setAssetDetails(null);
      }
    } catch (err) {
      if (seq === overviewReqSeq.current) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load infrastructure health data.",
        );
      }
    } finally {
      if (seq === overviewReqSeq.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadCities();
  }, []);

  useEffect(() => {
    void loadOverview(initialAssetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity, selectedWard, assetTypeFilter, gradeFilter, sortBy]);

  async function handleSelectAsset(assetId: string) {
    setSelectedAssetId(assetId);
    setShowLogMaintenanceForm(false);
    setMaintError(null);
    await loadAssetDetails(assetId);
  }

  async function handleRecomputeAll() {
    setRecomputing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.recomputeInfrastructureHealth(selectedCity);
      setNotice(
        `Recalculated health scores across ${res.recomputedCount} infrastructure asset${
          res.recomputedCount === 1 ? "" : "s"
        }${res.city ? ` in ${res.city}` : ""}.`,
      );
      await loadOverview(selectedAssetId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to recalculate infrastructure scores.",
      );
    } finally {
      setRecomputing(false);
    }
  }

  async function handleLogMaintenanceSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedAssetId) return;

    setSavingMaint(true);
    setMaintError(null);
    setNotice(null);
    try {
      const updatedDetails = await api.logAssetMaintenance(selectedAssetId, {
        eventType: maintType,
        outcome: maintOutcome,
        performedBy: maintPerformedBy.trim() || undefined,
        notes: maintNotes.trim() || undefined,
      });

      setAssetDetails(updatedDetails);
      setNotice(
        `Logged ${maintType.toLowerCase().replace(/_/g, " ")} (${maintOutcome.toLowerCase()}) for ${updatedDetails.asset.assetCode}. Updated health score: ${updatedDetails.asset.healthScore}/100 (${updatedDetails.asset.healthGrade}).`,
      );
      setMaintNotes("");
      setMaintPerformedBy("");
      setShowLogMaintenanceForm(false);
      await loadOverview(selectedAssetId);
    } catch (err) {
      setMaintError(
        err instanceof Error
          ? err.message
          : "Failed to record maintenance event.",
      );
    } finally {
      setSavingMaint(false);
    }
  }

  async function handleCreateAssetSubmit(e: FormEvent) {
    e.preventDefault();
    setCreatingAsset(true);
    setCreateAssetError(null);

    if (!pickedLocation) {
      setCreateAssetError(
        "Please select a location on the map before registering.",
      );
      setCreatingAsset(false);
      return;
    }

    const latNum = pickedLocation.latitude;
    const lngNum = pickedLocation.longitude;
    const radiusNum = Number(newAssetRadius || "250");

    try {
      const created = await api.createInfrastructureAsset({
        assetCode: newAssetCode.trim().toUpperCase(),
        name: newAssetName.trim(),
        assetType: newAssetType,
        city: resolvedGeo?.city ?? null,
        ward: resolvedGeo?.ward ?? null,
        zone: resolvedGeo?.zone ?? null,
        address: newAssetAddress.trim() || null,
        latitude: latNum,
        longitude: lngNum,
        catchmentRadiusMeters: Number.isFinite(radiusNum) ? radiusNum : 250,
        lastMaintainedAt: newAssetLastMaint
          ? new Date(`${newAssetLastMaint}T00:00:00Z`).toISOString()
          : null,
      });

      setShowCreateModal(false);
      setNewAssetCode("");
      setNewAssetName("");
      setNewAssetAddress("");
      setNewAssetLastMaint("");
      setPickedLocation(null);
      setResolvedGeo(null);
      setGeoResolveError(null);
      setViewMode("assets");
      setNotice(
        `Registered ${created.asset.assetCode} (${created.asset.name}) with initial health score ${created.asset.healthScore}/100 (${created.asset.healthGrade}).`,
      );
      setSelectedAssetId(created.asset.id);
      await loadOverview(created.asset.id);
    } catch (err) {
      setCreateAssetError(
        err instanceof Error
          ? err.message
          : "Failed to register infrastructure asset.",
      );
    } finally {
      setCreatingAsset(false);
    }
  }

  /**
   * Resolve administrative geography when the officer picks a map location.
   * Uses an AbortController-equivalent sequence counter to discard stale results.
   */
  const handleLocationPick = useCallback(
    async (loc: { latitude: number; longitude: number }) => {
      setPickedLocation(loc);
      // Clear stale administrative data immediately
      setResolvedGeo(null);
      setGeoResolveError(null);
      setGeoResolving(true);

      const seq = ++geoResolveSeq.current;
      try {
        const result = await api.resolveAdminGeography(
          loc.latitude,
          loc.longitude,
        );
        if (seq !== geoResolveSeq.current) return; // Stale — a newer pick superseded this one
        setResolvedGeo(result);
      } catch {
        if (seq !== geoResolveSeq.current) return;
        setGeoResolveError("Location outside supported coverage area.");
        setResolvedGeo(null);
      } finally {
        if (seq === geoResolveSeq.current) {
          setGeoResolving(false);
        }
      }
    },
    [],
  );

  const availableCities = useMemo(() => {
    const names = new Set<string>();
    for (const c of citiesData?.cities || []) {
      if (c.city) names.add(c.city);
    }
    for (const w of overview?.wards || []) {
      if (w.city && w.city !== "General Jurisdiction") names.add(w.city);
    }
    for (const a of overview?.assets || []) {
      if (a.city && a.city !== "General Jurisdiction") names.add(a.city);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [citiesData, overview]);

  const availableWards = useMemo(() => {
    const names = new Set<string>();
    for (const w of overview?.wards || []) {
      if (
        w.ward &&
        (selectedCity === "all" ||
          (w.city || "").toLowerCase() === selectedCity.toLowerCase())
      ) {
        names.add(w.ward);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [overview?.wards, selectedCity]);

  const filteredAssets = useMemo(() => {
    const list = overview?.assets || [];
    const q = searchTerm.trim().toLowerCase();
    return list.filter((a) => {
      if (conditionFilter === "deteriorating" && a.trend !== "DETERIORATING") {
        return false;
      }
      if (
        conditionFilter === "overdue" &&
        (a.maintenanceAgeMonths == null || a.maintenanceAgeMonths < 6)
      ) {
        return false;
      }
      if (
        conditionFilter === "cross_impact" &&
        (a.scoreBreakdown?.factors?.crossImpactCount ?? 0) === 0
      ) {
        return false;
      }
      if (minOpenIssues > 0 && (a.openComplaintCount ?? 0) < minOpenIssues) {
        return false;
      }
      if (!q) return true;
      return [
        a.assetCode,
        a.name,
        a.ward,
        a.city,
        a.address,
        a.department,
        a.assetTypeLabel,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [overview?.assets, searchTerm, conditionFilter, minOpenIssues]);

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (selectedCity !== "all") {
      chips.push({
        key: "city",
        label: `City: ${selectedCity}`,
        onRemove: () => {
          setSelectedCity("all");
          setSelectedWard("all");
        },
      });
    }
    if (selectedWard !== "all") {
      chips.push({
        key: "ward",
        label: `Ward: ${selectedWard}`,
        onRemove: () => setSelectedWard("all"),
      });
    }
    if (assetTypeFilter !== "all") {
      const lbl =
        ASSET_TYPE_OPTIONS.find((o) => o.value === assetTypeFilter)
          ?.shortLabel || assetTypeFilter;
      chips.push({
        key: "type",
        label: `Type: ${lbl}`,
        onRemove: () => setAssetTypeFilter("all"),
      });
    }
    if (gradeFilter !== "all") {
      chips.push({
        key: "grade",
        label: `Grade: ${gradeFilter}`,
        onRemove: () => setGradeFilter("all"),
      });
    }
    if (conditionFilter !== "all") {
      const condLbl =
        conditionFilter === "deteriorating"
          ? "Deteriorating"
          : conditionFilter === "overdue"
            ? "Overdue Maint (≥6mo)"
            : "Cross-Impact";
      chips.push({
        key: "cond",
        label: condLbl,
        onRemove: () => setConditionFilter("all"),
      });
    }
    if (minOpenIssues > 0) {
      chips.push({
        key: "minOpen",
        label: `≥ ${minOpenIssues} Open Issues`,
        onRemove: () => setMinOpenIssues(0),
      });
    }
    if (sortBy !== "lowest_health") {
      const sLbl =
        SORT_OPTIONS.find((s) => s.value === sortBy)?.label || sortBy;
      chips.push({
        key: "sort",
        label: `Sort: ${sLbl}`,
        onRemove: () => setSortBy("lowest_health"),
      });
    }
    return chips;
  }, [
    selectedCity,
    selectedWard,
    assetTypeFilter,
    gradeFilter,
    conditionFilter,
    minOpenIssues,
    sortBy,
  ]);

  function handleResetFilters() {
    setSelectedCity("all");
    setSelectedWard("all");
    setAssetTypeFilter("all");
    setGradeFilter("all");
    setConditionFilter("all");
    setMinOpenIssues(0);
    setSortBy("lowest_health");
    setSearchTerm("");
  }

  const activeAsset: InfrastructureAsset | null = assetDetails?.asset || null;
  const breakdown = activeAsset?.scoreBreakdown || {};
  const caps = breakdown.caps || {
    complaintImpact: 28,
    recurrence: 22,
    severity: 20,
    unresolvedDuration: 15,
    maintenanceAge: 15,
  };

  function handleInspectWorstWardAsset(wardItem: WardHealthItem) {
    if (!wardItem.worstAsset) return;
    setSelectedCity(wardItem.city || "all");
    setSelectedWard(wardItem.ward || "all");
    setGradeFilter("all");
    setAssetTypeFilter("all");
    setViewMode("assets");
    setSelectedAssetId(wardItem.worstAsset.id);
    setSearchParams({ assetId: wardItem.worstAsset.id }, { replace: true });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            <Heartbeat size={13} weight="bold" />
            Asset Condition &amp; Health Scoring
          </span>
          <h1 className="pt-1.5 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Infrastructure Health Scores
          </h1>
          <p className="text-sm font-medium text-ink-soft">
            Deterministic 0–100 health ratings combining citizen complaint
            pressure, recurrence &amp; overlap, severity, resolution lag, and
            maintenance age.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFormulaOpen((prev) => !prev)}
            aria-expanded={formulaOpen}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/75 bg-white/65 px-3.5 py-2 text-xs font-bold text-ink-soft shadow-sm backdrop-blur-md transition hover:bg-white hover:text-ink cursor-pointer"
          >
            <SlidersHorizontal size={14} weight="bold" />
            Formula &amp; Diagnostics
            <CaretDown
              size={12}
              weight="bold"
              className={`transition-transform ${formulaOpen ? "rotate-180" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={() => void handleRecomputeAll()}
            disabled={recomputing || loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/85 px-3.5 py-2 text-xs font-bold text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60 cursor-pointer"
          >
            <ArrowsClockwise
              size={14}
              className={recomputing ? "animate-spin" : ""}
            />
            {recomputing ? "Recalculating…" : "Recalculate Scores"}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowCreateModal(true);
            }}
            className="ios-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white cursor-pointer"
          >
            <Plus size={14} weight="bold" />
            Register Asset
          </button>
        </div>
      </div>

      {/* Collapsible Scoring Formula Legend */}
      <AnimatePresence initial={false}>
        {formulaOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="glass-panel border border-indigo-200/70 bg-gradient-to-r from-indigo-50/75 via-white/75 to-sky-50/75 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-indigo-100">
                <p className="font-bold text-ink">
                  {overview?.formula.expression ||
                    "Health Score = 100 - (Complaint Impact + Recurrence & Overlap + Severity + Unresolved Duration + Maintenance Age)"}
                </p>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                  <span className="rounded-full border border-emerald-300 bg-emerald-500/15 px-2 py-0.5 text-emerald-800">
                    80–100 GOOD
                  </span>
                  <span className="rounded-full border border-sky-300 bg-sky-500/15 px-2 py-0.5 text-sky-900">
                    60–79 FAIR
                  </span>
                  <span className="rounded-full border border-amber-300 bg-amber-500/15 px-2 py-0.5 text-amber-900">
                    40–59 POOR
                  </span>
                  <span className="rounded-full border border-rose-300 bg-rose-500/15 px-2 py-0.5 text-rose-800">
                    0–39 CRITICAL
                  </span>
                </div>
              </div>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-5">
                {[
                  {
                    name: "Complaint Impact",
                    cap: "Max 28 pts",
                    desc: "Open direct (1.0x) & cross-impact (0.6x) reports + upvotes",
                  },
                  {
                    name: "Recurrence & Overlap",
                    cap: "Max 22 pts",
                    desc: "30-day repeat incidents, water/road overlap & hotspot zones",
                  },
                  {
                    name: "Priority Severity",
                    cap: "Max 20 pts",
                    desc: "Weighted sum of open CRITICAL, HIGH, MEDIUM, LOW complaints",
                  },
                  {
                    name: "Unresolved Duration",
                    cap: "Max 15 pts",
                    desc: "Age of oldest & average unresolved linked complaints",
                  },
                  {
                    name: "Maintenance Age",
                    cap: "Max 15 pts",
                    desc: "Months elapsed since last completed field repair/resurfacing",
                  },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="rounded-xl border border-white/80 bg-white/70 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-ink">{item.name}</span>
                      <span className="font-mono text-[10px] font-bold text-indigo-700">
                        {item.cap}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-ink-soft">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>

              {infraMetrics && infraMetrics.totalAssets > 0 && (
                <div className="mt-3 grid gap-2 border-t border-indigo-100 pt-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-ink-soft">
                      Maintenance Status Consistency
                    </span>
                    <span className="mt-0.5 block font-mono text-sm font-extrabold text-indigo-800">
                      {infraMetrics.labelAlignment
                        .maintenanceAlignmentPercent ?? 100}
                      %
                    </span>
                    <span className="text-[10px] text-ink-soft">
                      {infraMetrics.labelAlignment.overdueSubHealthyCount}/
                      {infraMetrics.labelAlignment.overdueMaintenanceCount}{" "}
                      overdue assets &lt; 80
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-ink-soft">
                      Potential Improvement: Resolve Complaints
                    </span>
                    <span className="mt-0.5 block font-mono text-sm font-extrabold text-emerald-700">
                      +
                      {infraMetrics.sensitivityAnalysis.deltaResolveOpenPts.toFixed(
                        1,
                      )}{" "}
                      pts
                    </span>
                    <span className="text-[10px] text-ink-soft">
                      Fleet avg rises to{" "}
                      {
                        infraMetrics.sensitivityAnalysis
                          .whatIfResolveAllOpenAvgHealth
                      }
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-ink-soft">
                      Potential Improvement: Complete Maintenance
                    </span>
                    <span className="mt-0.5 block font-mono text-sm font-extrabold text-blue-700">
                      +
                      {infraMetrics.sensitivityAnalysis.deltaCompleteMaintenancePts.toFixed(
                        1,
                      )}{" "}
                      pts
                    </span>
                    <span className="text-[10px] text-ink-soft">
                      Fleet avg rises to{" "}
                      {
                        infraMetrics.sensitivityAnalysis
                          .whatIfCompleteMaintenanceAvgHealth
                      }
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-ink-soft">
                      Average Health Points Lost
                    </span>
                    <span className="mt-0.5 block font-mono text-sm font-extrabold text-rose-700">
                      -{infraMetrics.averagePenalties.totalPenalty.toFixed(1)}{" "}
                      pts
                    </span>
                    <span className="text-[10px] text-ink-soft">
                      Top drag: Maint (-
                      {infraMetrics.averagePenalties.maintenanceAgePenalty.toFixed(
                        1,
                      )}
                      ) · Sev (-
                      {infraMetrics.averagePenalties.severityPenalty.toFixed(1)}
                      )
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notice & Error Banners */}
      {notice && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300/70 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle
              size={16}
              weight="fill"
              className="shrink-0 text-emerald-700"
            />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notice"
            className="rounded-md p-1 text-emerald-800 hover:bg-emerald-500/20 cursor-pointer"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-rose-300/70 bg-rose-500/15 px-4 py-3 text-xs font-semibold text-rose-900"
        >
          <WarningCircle
            size={18}
            weight="fill"
            className="shrink-0 text-rose-700"
          />
          <span>{error}</span>
        </div>
      )}

      {/* Top KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        <div className="ios-widget flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Avg Health Score
            </span>
            <Gauge size={18} weight="duotone" className="text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-ink">
              {overview?.summary.avgHealthScore ?? "—"}
            </span>
            <span className="text-xs font-semibold text-ink-soft">/ 100</span>
            {overview && (
              <span
                className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  getGradeTheme(overview.summary.avgHealthGrade).badge
                }`}
              >
                {overview.summary.avgHealthGrade}
              </span>
            )}
          </div>
        </div>

        <div className="ios-widget flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Monitored Assets
            </span>
            <ShieldCheck
              size={18}
              weight="duotone"
              className="text-indigo-600"
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-ink">
              {overview?.summary.totalAssets ?? 0}
            </span>
            <span className="text-xs font-medium text-ink-soft">
              across {overview?.wards.length ?? 0} wards
            </span>
          </div>
        </div>

        <div className="ios-widget flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Critical &amp; Poor
            </span>
            <WarningCircle
              size={18}
              weight="duotone"
              className="text-rose-600"
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-rose-700">
              {overview
                ? overview.summary.gradeCounts.CRITICAL +
                  overview.summary.gradeCounts.POOR
                : 0}
            </span>
            <span className="text-[11px] font-medium text-ink-soft">
              {overview
                ? `${overview.summary.gradeCounts.CRITICAL} critical · ${overview.summary.gradeCounts.POOR} poor`
                : "Needs attention"}
            </span>
          </div>
        </div>

        <div className="ios-widget flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Overdue Maintenance
            </span>
            <Wrench size={18} weight="duotone" className="text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-amber-800">
              {overview?.summary.maintenanceOverdueCount ?? 0}
            </span>
            <span className="text-[11px] font-medium text-ink-soft">
              &gt;= 6 mo since repair
            </span>
          </div>
        </div>

        <div className="ios-widget col-span-2 md:col-span-1 flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Open Linked Issues
            </span>
            <TrendDown size={18} weight="duotone" className="text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-ink">
              {overview?.summary.openLinkedComplaints ?? 0}
            </span>
            <span className="text-[11px] font-medium text-ink-soft">
              {overview?.summary.deterioratingCount ?? 0} deteriorating
            </span>
          </div>
        </div>
      </div>

      {/* Clean Compact Filter Bar + Expandable Panel */}
      <ExpandableFilterBar
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen((prev) => !prev)}
        activeCount={activeFilterChips.length}
        chips={activeFilterChips}
        onResetAll={handleResetFilters}
        panelTitle="Infrastructure Health Filters"
        leading={
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search asset code (RD-HYD-1024), ward, street…"
              aria-label="Filter listed assets"
              className="glass-input w-full py-2 pl-8 pr-3 text-xs"
            />
          </div>
        }
        trailing={
          <div className="inline-flex rounded-2xl border border-white/70 bg-white/55 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setViewMode("assets")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                viewMode === "assets"
                  ? "bg-primary text-white shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              <Heartbeat size={14} weight="duotone" />
              Monitored Assets ({filteredAssets.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("wards")}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                viewMode === "wards"
                  ? "bg-primary text-white shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              <Buildings size={14} weight="duotone" />
              Ward Health Rankings ({overview?.wards.length ?? 0})
            </button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Jurisdiction */}
          <div className="flex flex-col gap-1.5">
            <label className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              <GlobeHemisphereEast size={13} className="text-primary" />
              Jurisdiction (City)
            </label>
            <select
              value={selectedCity}
              onChange={(e) => {
                setSelectedCity(e.target.value);
                setSelectedWard("all");
              }}
              aria-label="Filter by city"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="all">All Cities</option>
              {availableCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          {/* Ward */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Municipal Ward
            </label>
            <select
              value={selectedWard}
              onChange={(e) => setSelectedWard(e.target.value)}
              aria-label="Filter by ward"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="all">All Wards</option>
              {availableWards.map((ward) => (
                <option key={ward} value={ward}>
                  {ward}
                </option>
              ))}
            </select>
          </div>

          {/* Asset Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Asset Category
            </label>
            <select
              value={assetTypeFilter}
              onChange={(e) =>
                setAssetTypeFilter(e.target.value as "all" | AssetType)
              }
              aria-label="Filter by asset category"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              {ASSET_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Health Grade */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Health Grade
            </label>
            <select
              value={gradeFilter}
              onChange={(e) =>
                setGradeFilter(e.target.value as "all" | HealthGrade)
              }
              aria-label="Filter by health grade"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              {GRADE_OPTIONS.map((grade) => (
                <option key={grade} value={grade}>
                  {grade === "all" ? "All Grades" : grade}
                </option>
              ))}
            </select>
          </div>

          {/* Condition & Maintenance Pattern */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Condition &amp; Pattern
            </label>
            <select
              value={conditionFilter}
              onChange={(e) =>
                setConditionFilter(
                  e.target.value as
                    | "all"
                    | "deteriorating"
                    | "overdue"
                    | "cross_impact",
                )
              }
              aria-label="Filter by condition pattern"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="all">All Conditions</option>
              <option value="deteriorating">Deteriorating Trend Only</option>
              <option value="overdue">Overdue Maintenance (≥ 6 mo)</option>
              <option value="cross_impact">
                Has Cross-Infrastructure Impact
              </option>
            </select>
          </div>

          {/* Minimum Open Complaints */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Minimum Open Issues
            </label>
            <select
              value={String(minOpenIssues)}
              onChange={(e) => setMinOpenIssues(Number(e.target.value))}
              aria-label="Minimum open complaints"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              <option value="0">Any Count</option>
              <option value="1">≥ 1 Open Complaint</option>
              <option value="2">≥ 2 Open Complaints</option>
              <option value="3">≥ 3 Open Complaints</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Sort Order
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort infrastructure assets"
              className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ExpandableFilterBar>

      {/* Main Content */}
      {loading && !overview ? (
        <div className="glass-panel flex items-center justify-center gap-2.5 py-16 text-sm font-medium text-ink-soft">
          <ArrowsClockwise size={18} className="animate-spin text-primary" />
          Computing infrastructure health scores…
        </div>
      ) : viewMode === "wards" ? (
        /* Ward Health Rankings Mode */
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(overview?.wards || []).length === 0 ? (
            <div className="glass-panel col-span-full p-10 text-center text-sm text-ink-soft">
              No wards matched the selected filters.
            </div>
          ) : (
            (overview?.wards || []).map((w) => {
              const gradeTheme = getGradeTheme(w.healthGrade);
              return (
                <article
                  key={`${w.city}-${w.ward}`}
                  className="glass-panel flex flex-col justify-between gap-4 p-5"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                            {w.city}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${gradeTheme.badge}`}
                          >
                            {w.healthGrade}
                          </span>
                        </div>
                        <h2 className="mt-1 truncate text-base font-extrabold text-ink">
                          {w.ward}
                        </h2>
                        <p className="text-xs text-ink-soft">{w.zone}</p>
                      </div>

                      <HealthScoreRing
                        score={w.healthScore}
                        grade={w.healthGrade}
                        size={56}
                        strokeWidth={5}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border border-white/75 bg-white/55 px-2 py-2">
                        <span className="block font-mono text-sm font-extrabold text-ink">
                          {w.assetCount}
                        </span>
                        <span className="text-[10px] font-semibold text-ink-soft">
                          Assets
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/75 bg-white/55 px-2 py-2">
                        <span className="block font-mono text-sm font-extrabold text-rose-700">
                          {w.criticalOrPoorAssets}
                        </span>
                        <span className="text-[10px] font-semibold text-ink-soft">
                          Poor/Critical
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/75 bg-white/55 px-2 py-2">
                        <span className="block font-mono text-sm font-extrabold text-blue-700">
                          {w.openComplaints}
                        </span>
                        <span className="text-[10px] font-semibold text-ink-soft">
                          Open Issues
                        </span>
                      </div>
                    </div>

                    {w.worstAsset && (
                      <div className="mt-3 rounded-xl border border-white/75 bg-white/60 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase text-ink-soft">
                            Lowest-Scoring Asset
                          </span>
                          <span
                            className={`font-mono text-[11px] font-extrabold ${
                              getGradeTheme(w.worstAsset.healthGrade).text
                            }`}
                          >
                            {w.worstAsset.healthScore} / 100
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-semibold text-ink">
                          <span className="font-mono text-primary">
                            {w.worstAsset.assetCode}
                          </span>{" "}
                          · {w.worstAsset.name}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/50 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCity(w.city);
                        setSelectedWard(w.ward);
                        setViewMode("assets");
                      }}
                      className="rounded-lg border border-white/80 bg-white/70 px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-white cursor-pointer"
                    >
                      Filter Ward Assets
                    </button>

                    {w.worstAsset ? (
                      <button
                        type="button"
                        onClick={() => handleInspectWorstWardAsset(w)}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-primary-strong cursor-pointer"
                      >
                        Inspect Worst Asset
                        <ArrowUpRight size={12} weight="bold" />
                      </button>
                    ) : (
                      <Link
                        to={`/officer/spatial-intelligence?city=${encodeURIComponent(
                          w.city,
                        )}&ward=${encodeURIComponent(w.ward)}`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                      >
                        Open Spatial Map →
                      </Link>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : (
        /* Assets & Inspector Split View */
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)] xl:items-start">
          {/* Left Column: Asset List */}
          <div className="glass-panel flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between px-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              <span>Assets ({filteredAssets.length})</span>
              <span className="font-normal normal-case">
                Click card to inspect score &amp; repairs
              </span>
            </div>

            {filteredAssets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/70 bg-white/40 px-4 py-10 text-center text-xs text-ink-soft">
                No infrastructure assets matched the current filters. Try
                clearing a grade/city filter or register a new asset.
              </div>
            ) : (
              <div className="flex max-h-[760px] flex-col gap-2.5 overflow-y-auto pr-1">
                {filteredAssets.map((asset) => {
                  const isSelected = asset.id === selectedAssetId;
                  const gradeTheme = getGradeTheme(asset.healthGrade);
                  const trendBadge = getTrendBadge(asset.trend);
                  const TrendIcon = trendBadge.icon;
                  const AssetIcon = getAssetTypeIcon(asset.assetType);
                  const crossCount =
                    asset.scoreBreakdown?.factors?.crossImpactCount ?? 0;

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => void handleSelectAsset(asset.id)}
                      className={`group flex w-full flex-col gap-2.5 rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                        isSelected
                          ? "border-primary/60 bg-white/95 shadow-[0_8px_24px_-4px_rgba(29,78,216,0.2)] ring-2 ring-primary/25"
                          : "border-white/75 bg-white/60 hover:bg-white/85"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900/5 text-primary">
                            <AssetIcon size={18} weight="duotone" />
                          </span>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-xs font-extrabold text-primary">
                                {asset.assetCode}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${gradeTheme.badge}`}
                              >
                                {asset.healthGrade}
                              </span>
                              <span
                                className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${trendBadge.cls}`}
                              >
                                <TrendIcon size={10} weight="bold" />
                                {trendBadge.label}
                              </span>
                            </div>

                            <h3 className="mt-1 truncate text-sm font-bold text-ink">
                              {asset.name}
                            </h3>

                            <p className="mt-0.5 truncate text-[11px] text-ink-soft">
                              {[asset.assetTypeLabel, asset.ward, asset.city]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>

                        <HealthScoreRing
                          score={asset.healthScore}
                          grade={asset.healthGrade}
                          size={48}
                          strokeWidth={4.5}
                        />
                      </div>

                      {/* Mini health bar */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${gradeTheme.barFill}`}
                          style={{
                            width: `${Math.max(4, asset.healthScore)}%`,
                          }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                        <span>
                          <strong className="font-mono text-ink">
                            {asset.openComplaintCount}
                          </strong>{" "}
                          open / {asset.complaintCount} linked reports
                        </span>
                        {crossCount > 0 && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            {crossCount} cross-impact
                          </span>
                        )}
                        <span>
                          Maint:{" "}
                          {formatMaintenanceAge(asset.maintenanceAgeMonths)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Selected Asset Explainable Inspector */}
          <div className="glass-panel flex flex-col gap-5 p-5 sm:p-6 xl:sticky xl:top-24">
            {loadingDetails ? (
              <div className="flex items-center justify-center gap-2 py-16 text-xs font-medium text-ink-soft">
                <ArrowsClockwise
                  size={16}
                  className="animate-spin text-primary"
                />
                Loading asset condition breakdown…
              </div>
            ) : !activeAsset ? (
              <div className="py-16 text-center text-xs text-ink-soft">
                Select an infrastructure asset on the left to inspect its
                deterministic health breakdown, linked citizen complaints, and
                maintenance history.
              </div>
            ) : (
              <>
                {/* Inspector Header */}
                <div className="flex flex-col gap-3 border-b border-white/55 pb-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <HealthScoreRing
                      score={activeAsset.healthScore}
                      grade={activeAsset.healthGrade}
                      size={70}
                      strokeWidth={6}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-primary-soft/80 px-2 py-0.5 font-mono text-xs font-extrabold text-primary">
                          {activeAsset.assetCode}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${
                            getGradeTheme(activeAsset.healthGrade).badge
                          }`}
                        >
                          {activeAsset.healthGrade}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            getTrendBadge(activeAsset.trend).cls
                          }`}
                        >
                          {getTrendBadge(activeAsset.trend).label}
                        </span>
                      </div>

                      <h2 className="mt-1.5 text-lg font-extrabold leading-snug tracking-tight text-ink">
                        {activeAsset.name}
                      </h2>
                      <p className="mt-0.5 text-xs font-medium text-ink-soft">
                        {activeAsset.assetTypeLabel} · {activeAsset.department}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-ink-soft">
                      <MapPin size={13} className="shrink-0 text-primary" />
                      <span className="truncate">
                        {[
                          activeAsset.address,
                          activeAsset.ward,
                          activeAsset.city,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </p>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        to={`/officer/copilot?assetCode=${encodeURIComponent(activeAsset.assetCode)}&q=${encodeURIComponent(`Why is ${activeAsset.assetCode} repeatedly receiving complaints and what should be inspected before repair?`)}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50/90 px-3 py-1.5 text-xs font-bold text-purple-800 transition hover:bg-purple-100"
                      >
                        <Robot size={13} weight="bold" />
                        Ask Copilot
                      </Link>

                      <Link
                        to={`/officer/knowledge-graph?assetCode=${encodeURIComponent(activeAsset.assetCode)}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/85 px-3 py-1.5 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100"
                      >
                        <ShareNetwork size={13} weight="bold" />
                        Investigate in Graph
                      </Link>

                      {activeAsset.latitude != null &&
                        activeAsset.longitude != null && (
                          <Link
                            to={`/officer/spatial-intelligence?city=${encodeURIComponent(
                              activeAsset.city || "all",
                            )}&lat=${activeAsset.latitude}&lng=${activeAsset.longitude}&ward=${encodeURIComponent(
                              activeAsset.ward || "",
                            )}&ref=${encodeURIComponent(activeAsset.assetCode)}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/85 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-blue-100"
                          >
                            <Crosshair size={13} weight="bold" />
                            Focus on Map
                          </Link>
                        )}

                      <button
                        type="button"
                        onClick={() => {
                          setMaintenanceOpen(true);
                          setShowLogMaintenanceForm((prev) => !prev);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-strong cursor-pointer"
                      >
                        <Wrench size={13} weight="bold" />
                        {showLogMaintenanceForm
                          ? "Close Form"
                          : "Log Maintenance"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Metadata Chips */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/75 bg-white/60 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-ink-soft">
                      Last Maintained
                    </span>
                    <span className="mt-0.5 block text-xs font-bold text-ink">
                      {formatDateShort(activeAsset.lastMaintainedAt)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/75 bg-white/60 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-ink-soft">
                      Maint Age
                    </span>
                    <span className="mt-0.5 block text-xs font-bold text-ink">
                      {formatMaintenanceAge(activeAsset.maintenanceAgeMonths)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/75 bg-white/60 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-ink-soft">
                      Catchment Radius
                    </span>
                    <span className="mt-0.5 block font-mono text-xs font-bold text-ink">
                      {activeAsset.catchmentRadiusMeters} m
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/75 bg-white/60 px-3 py-2">
                    <span className="block text-[10px] font-bold uppercase text-ink-soft">
                      30d Recurrence
                    </span>
                    <span className="mt-0.5 block font-mono text-xs font-bold text-ink">
                      {activeAsset.recurrenceCount} repeat
                      {activeAsset.recurrenceCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                {/* Explainable 5-Penalty Waterfall */}
                <section className="rounded-2xl border border-white/75 bg-white/60 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-ink">
                      Explainable Score Breakdown
                    </h3>
                    <span className="font-mono text-xs font-bold text-ink-soft">
                      100 −{" "}
                      <span className="text-rose-700">
                        {Number(
                          breakdown.totalPenalty ??
                            100 - activeAsset.healthScore,
                        ).toFixed(1)}
                      </span>{" "}
                      ={" "}
                      <span
                        className={getGradeTheme(activeAsset.healthGrade).text}
                      >
                        {activeAsset.healthScore} / 100
                      </span>
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      {
                        label: "Complaint Impact",
                        val: Number(breakdown.complaintImpactPenalty ?? 0),
                        max: caps.complaintImpact,
                        hint: `${breakdown.factors?.directCount ?? 0} direct · ${
                          breakdown.factors?.openCount ??
                          activeAsset.openComplaintCount
                        } open`,
                      },
                      {
                        label: "Recurrence & Overlap",
                        val: Number(breakdown.recurrencePenalty ?? 0),
                        max: caps.recurrence,
                        hint: `${breakdown.factors?.crossImpactCount ?? 0} cross-impact${
                          breakdown.factors?.inActiveHotspot
                            ? " · in active hotspot"
                            : ""
                        }`,
                      },
                      {
                        label: "Priority Severity",
                        val: Number(breakdown.severityPenalty ?? 0),
                        max: caps.severity,
                        hint: "Weighted open CRITICAL/HIGH/MEDIUM issues",
                      },
                      {
                        label: "Unresolved Duration",
                        val: Number(breakdown.unresolvedDurationPenalty ?? 0),
                        max: caps.unresolvedDuration,
                        hint:
                          (breakdown.factors?.maxOpenAgeDays ?? 0) > 0
                            ? `Oldest open: ${breakdown.factors?.maxOpenAgeDays}d`
                            : "No aged backlog",
                      },
                      {
                        label: "Maintenance Age",
                        val: Number(breakdown.maintenanceAgePenalty ?? 0),
                        max: caps.maintenanceAge,
                        hint: `${formatMaintenanceAge(
                          breakdown.factors?.maintenanceAgeMonths ??
                            activeAsset.maintenanceAgeMonths,
                        )}`,
                      },
                    ].map((row) => {
                      const pct = Math.min(
                        100,
                        Math.round((row.val / row.max) * 100),
                      );
                      return (
                        <div key={row.label}>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div>
                              <span className="font-bold text-ink">
                                {row.label}
                              </span>
                              <span className="ml-2 text-[11px] text-ink-soft">
                                ({row.hint})
                              </span>
                            </div>
                            <span className="font-mono text-xs font-extrabold text-ink">
                              -{row.val.toFixed(1)}{" "}
                              <span className="font-normal text-ink-soft">
                                / {row.max}
                              </span>
                            </span>
                          </div>
                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                pct >= 75
                                  ? "bg-rose-500"
                                  : pct >= 45
                                    ? "bg-amber-500"
                                    : "bg-indigo-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Collapsible Linked Citizen Complaints */}
                <section className="overflow-hidden rounded-2xl border border-white/75 bg-white/55">
                  <button
                    type="button"
                    aria-expanded={complaintsOpen}
                    onClick={() => setComplaintsOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-ink">
                        Linked Citizen Complaints (
                        {assetDetails?.linkedComplaints.length ?? 0})
                      </span>
                      {(breakdown.factors?.crossImpactCount ?? 0) > 0 && (
                        <span className="rounded-full border border-amber-300 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          {breakdown.factors?.crossImpactCount} Cross-Impact
                        </span>
                      )}
                    </div>
                    <CaretDown
                      size={14}
                      weight="bold"
                      className={`text-ink-soft transition-transform ${
                        complaintsOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {complaintsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-white/60"
                      >
                        <div className="flex flex-col gap-2.5 p-4">
                          {(assetDetails?.linkedComplaints || []).length ===
                          0 ? (
                            <p className="text-xs text-ink-soft">
                              No citizen complaints currently fall within this
                              asset&apos;s catchment area.
                            </p>
                          ) : (
                            (assetDetails?.linkedComplaints || []).map((c) => (
                              <Link
                                key={c.id}
                                to={`/officer/complaints/${c.id}`}
                                className="flex flex-col gap-1 rounded-xl border border-white/80 bg-white/75 p-3 transition hover:border-blue-300 hover:bg-white"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono text-[11px] font-bold text-primary">
                                      #{c.referenceId || c.id.slice(0, 8)}
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        c.linkType === "CROSS_IMPACT"
                                          ? "border border-amber-300 bg-amber-500/15 text-amber-900"
                                          : "border border-indigo-200 bg-indigo-50 text-indigo-800"
                                      }`}
                                    >
                                      {c.linkType === "CROSS_IMPACT"
                                        ? "Cross-Impact"
                                        : "Direct Impact"}
                                    </span>
                                    {c.priority && (
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                                        {c.priority}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] font-semibold capitalize text-ink-soft">
                                    {c.status.replace(/_/g, " ").toLowerCase()}
                                    {c.distanceMeters != null
                                      ? ` · ${Math.round(c.distanceMeters)} m`
                                      : ""}
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-ink">
                                  {c.title}
                                </p>
                                {c.linkReason && (
                                  <p className="text-[11px] text-ink-soft">
                                    {c.linkReason}
                                  </p>
                                )}
                              </Link>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>

                {/* Collapsible Maintenance History + Log Maintenance Form */}
                <section className="overflow-hidden rounded-2xl border border-white/75 bg-white/55">
                  <button
                    type="button"
                    aria-expanded={maintenanceOpen}
                    onClick={() => setMaintenanceOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-ink">
                        Maintenance Log &amp; Inspections (
                        {assetDetails?.maintenanceEvents.length ?? 0})
                      </span>
                    </div>
                    <CaretDown
                      size={14}
                      weight="bold"
                      className={`text-ink-soft transition-transform ${
                        maintenanceOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {maintenanceOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-white/60"
                      >
                        <div className="flex flex-col gap-3 p-4">
                          {showLogMaintenanceForm && (
                            <form
                              onSubmit={(e) =>
                                void handleLogMaintenanceSubmit(e)
                              }
                              className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-extrabold text-indigo-950">
                                  Record Field Work for {activeAsset.assetCode}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowLogMaintenanceForm(false)
                                  }
                                  className="text-[11px] font-semibold text-ink-soft hover:text-ink cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>

                              {maintError && (
                                <p className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-800">
                                  {maintError}
                                </p>
                              )}

                              <div className="grid gap-2.5 sm:grid-cols-2">
                                <label className="text-[11px] font-bold text-ink">
                                  Activity Type
                                  <select
                                    value={maintType}
                                    onChange={(e) =>
                                      setMaintType(
                                        e.target.value as MaintenanceEventType,
                                      )
                                    }
                                    className="glass-input mt-1 w-full px-2.5 py-1.5 text-xs font-semibold"
                                  >
                                    {MAINTENANCE_TYPES.map((t) => (
                                      <option key={t.value} value={t.value}>
                                        {t.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="text-[11px] font-bold text-ink">
                                  Outcome
                                  <select
                                    value={maintOutcome}
                                    onChange={(e) =>
                                      setMaintOutcome(
                                        e.target.value as MaintenanceOutcome,
                                      )
                                    }
                                    className="glass-input mt-1 w-full px-2.5 py-1.5 text-xs font-semibold"
                                  >
                                    {MAINTENANCE_OUTCOMES.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        {o.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>

                              <label className="block text-[11px] font-bold text-ink">
                                Performed By (optional)
                                <input
                                  type="text"
                                  value={maintPerformedBy}
                                  onChange={(e) =>
                                    setMaintPerformedBy(e.target.value)
                                  }
                                  placeholder="e.g. Ward 12 Road Crew"
                                  className="glass-input mt-1 w-full px-2.5 py-1.5 text-xs"
                                />
                              </label>

                              <label className="block text-[11px] font-bold text-ink">
                                Work Notes
                                <textarea
                                  rows={2}
                                  value={maintNotes}
                                  onChange={(e) =>
                                    setMaintNotes(e.target.value)
                                  }
                                  placeholder="Describe repairs completed, resurfacing depth, valve replacement, etc."
                                  className="glass-input mt-1 w-full px-2.5 py-1.5 text-xs"
                                />
                              </label>

                              <div className="flex justify-end">
                                <button
                                  type="submit"
                                  disabled={savingMaint}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-primary-strong disabled:opacity-60 cursor-pointer"
                                >
                                  {savingMaint
                                    ? "Saving & Re-scoring…"
                                    : "Submit Event"}
                                </button>
                              </div>
                            </form>
                          )}

                          {(assetDetails?.maintenanceEvents || []).length ===
                          0 ? (
                            <p className="text-xs text-ink-soft">
                              No maintenance events recorded yet for this asset.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {(assetDetails?.maintenanceEvents || []).map(
                                (ev) => (
                                  <div
                                    key={ev.id}
                                    className="rounded-xl border border-white/80 bg-white/75 px-3 py-2.5 text-xs"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-ink">
                                          {ev.eventType.replace(/_/g, " ")}
                                        </span>
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                            ev.outcome === "COMPLETED"
                                              ? "bg-emerald-500/15 text-emerald-800"
                                              : ev.outcome ===
                                                  "FAILED_INSPECTION"
                                                ? "bg-rose-500/15 text-rose-800"
                                                : "bg-amber-500/15 text-amber-800"
                                          }`}
                                        >
                                          {ev.outcome.replace(/_/g, " ")}
                                        </span>
                                      </div>
                                      <span className="text-[11px] text-ink-soft">
                                        {formatDateShort(ev.performedAt)}
                                      </span>
                                    </div>
                                    {ev.notes && (
                                      <p className="mt-1 text-[11px] text-ink-soft">
                                        {ev.notes}
                                      </p>
                                    )}
                                    <p className="mt-1 text-[10px] font-semibold text-ink-soft">
                                      By {ev.performedBy}
                                    </p>
                                  </div>
                                ),
                              )}
                            </div>
                          )}

                          {/* Recent Health Snapshots */}
                          {(assetDetails?.healthHistory || []).length > 0 && (
                            <div className="border-t border-white/60 pt-2.5">
                              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                                <ClockCounterClockwise size={12} />
                                Score Snapshot History
                              </div>
                              <HealthHistorySparkline
                                history={assetDetails?.healthHistory || []}
                              />
                              <div className="flex flex-wrap gap-1.5">
                                {assetDetails?.healthHistory
                                  .slice(0, 6)
                                  .map((h) => (
                                    <span
                                      key={h.id}
                                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
                                        getGradeTheme(h.healthGrade).badge
                                      }`}
                                    >
                                      {h.healthScore} ({h.healthGrade}) ·{" "}
                                      {formatDateShort(h.recordedAt)}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              </>
            )}
          </div>
        </div>
      )}

      {/* Register New Infrastructure Asset Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-asset-title"
        >
          <div className="glass-panel max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white/90 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
              <div>
                <h2
                  id="register-asset-title"
                  className="text-base font-extrabold text-ink"
                >
                  Register Infrastructure Asset
                </h2>
                <p className="text-xs text-ink-soft">
                  New assets are automatically matched with nearby complaints
                  and scored immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setPickedLocation(null);
                  setResolvedGeo(null);
                  setGeoResolveError(null);
                }}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-ink-soft hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleCreateAssetSubmit(e)}
              className="mt-4 space-y-4"
            >
              {createAssetError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"
                >
                  {createAssetError}
                </div>
              )}

              {/* Section A — Asset Identification */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-ink">
                  Asset Code *
                  <input
                    type="text"
                    required
                    value={newAssetCode}
                    onChange={(e) => setNewAssetCode(e.target.value)}
                    placeholder="e.g. RD-CHN-2050"
                    className="glass-input mt-1 w-full px-3 py-2 text-xs uppercase"
                  />
                </label>

                <label className="text-xs font-bold text-ink">
                  Asset Type *
                  <select
                    value={newAssetType}
                    onChange={(e) =>
                      setNewAssetType(e.target.value as AssetType)
                    }
                    className="glass-input mt-1 w-full px-3 py-2 text-xs font-semibold"
                  >
                    {ASSET_TYPE_OPTIONS.filter((o) => o.value !== "all").map(
                      (o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <label className="block text-xs font-bold text-ink">
                Asset Name *
                <input
                  type="text"
                  required
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  placeholder="e.g. Anna Nagar West Road Segment"
                  className="glass-input mt-1 w-full px-3 py-2 text-xs"
                />
              </label>

              {/* Section B — Interactive Map Picker */}
              <div>
                <p className="text-xs font-bold text-ink">
                  Select Location on Map{" "}
                  <span className="text-rose-600">*</span>
                </p>
                <p className="mt-0.5 text-[11px] text-ink-soft">
                  Click on the map to select the asset location. Drag the marker
                  to adjust it.
                </p>
                <div className="mt-2">
                  <AssetLocationPicker
                    pickedLocation={pickedLocation}
                    defaultCenter={DEFAULT_MAP_CENTER}
                    onLocationPick={(loc) => void handleLocationPick(loc)}
                  />
                </div>
              </div>

              {/* Section C — Coordinates and Maintenance Details */}
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="text-xs font-bold text-ink">
                  Latitude *
                  <input
                    type="text"
                    readOnly
                    required
                    value={
                      pickedLocation ? pickedLocation.latitude.toFixed(6) : ""
                    }
                    placeholder="Pick on map"
                    className="glass-input mt-1 w-full cursor-not-allowed bg-slate-50/80 px-2.5 py-2 text-xs font-mono text-ink-soft"
                  />
                </label>
                <label className="text-xs font-bold text-ink">
                  Longitude *
                  <input
                    type="text"
                    readOnly
                    required
                    value={
                      pickedLocation ? pickedLocation.longitude.toFixed(6) : ""
                    }
                    placeholder="Pick on map"
                    className="glass-input mt-1 w-full cursor-not-allowed bg-slate-50/80 px-2.5 py-2 text-xs font-mono text-ink-soft"
                  />
                </label>
                <label className="text-xs font-bold text-ink">
                  Radius (m)
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    value={newAssetRadius}
                    onChange={(e) => setNewAssetRadius(e.target.value)}
                    className="glass-input mt-1 w-full px-2.5 py-2 text-xs"
                  />
                </label>
                <label className="text-xs font-bold text-ink">
                  Last Maintained
                  <input
                    type="date"
                    value={newAssetLastMaint}
                    onChange={(e) => setNewAssetLastMaint(e.target.value)}
                    className="glass-input mt-1 w-full px-2 py-2 text-xs"
                  />
                </label>
              </div>

              {/* Section D — Administrative Location (auto-resolved) */}
              <div>
                {geoResolving && (
                  <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-700">
                    <ArrowsClockwise
                      size={13}
                      className="animate-spin shrink-0"
                    />
                    Resolving administrative geography…
                  </div>
                )}

                {!geoResolving && geoResolveError && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] font-semibold text-amber-800">
                    Location outside supported administrative coverage. City,
                    ward and zone will not be assigned automatically.
                  </div>
                )}

                {!geoResolving &&
                  resolvedGeo &&
                  !resolvedGeo.resolved &&
                  !geoResolveError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] font-semibold text-amber-800">
                      Location outside supported administrative coverage. City,
                      ward and zone will not be assigned automatically.
                    </div>
                  )}

                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-bold text-ink">
                    City
                    <input
                      type="text"
                      readOnly
                      value={resolvedGeo?.city ?? ""}
                      placeholder={
                        geoResolving
                          ? "Resolving…"
                          : pickedLocation
                            ? "Not covered"
                            : "Select map location"
                      }
                      className="glass-input mt-1 w-full cursor-not-allowed bg-slate-50/80 px-3 py-2 text-xs text-ink-soft"
                    />
                  </label>
                  <label className="text-xs font-bold text-ink">
                    Zone
                    <input
                      type="text"
                      readOnly
                      value={resolvedGeo?.zone ?? ""}
                      placeholder={
                        geoResolving
                          ? "Resolving…"
                          : pickedLocation
                            ? "Not covered"
                            : "Select map location"
                      }
                      className="glass-input mt-1 w-full cursor-not-allowed bg-slate-50/80 px-3 py-2 text-xs text-ink-soft"
                    />
                  </label>
                  <label className="text-xs font-bold text-ink">
                    Ward
                    <input
                      type="text"
                      readOnly
                      value={resolvedGeo?.ward ?? ""}
                      placeholder={
                        geoResolving
                          ? "Resolving…"
                          : pickedLocation
                            ? "Not covered"
                            : "Select map location"
                      }
                      className="glass-input mt-1 w-full cursor-not-allowed bg-slate-50/80 px-3 py-2 text-xs text-ink-soft"
                    />
                  </label>
                </div>
              </div>

              {/* Section E — Address / Stretch Description */}
              <label className="block text-xs font-bold text-ink">
                Address / Stretch Description
                <input
                  type="text"
                  value={newAssetAddress}
                  onChange={(e) => setNewAssetAddress(e.target.value)}
                  placeholder="Optional street or junction landmark"
                  className="glass-input mt-1 w-full px-3 py-2 text-xs"
                />
              </label>

              {/* Section F — Actions */}
              <div className="flex justify-end gap-2 border-t border-slate-200/70 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setPickedLocation(null);
                    setResolvedGeo(null);
                    setGeoResolveError(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-ink-soft hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAsset || !pickedLocation}
                  className="ios-btn-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-60 cursor-pointer"
                >
                  {creatingAsset
                    ? "Registering & Scoring…"
                    : "Register & Score Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
