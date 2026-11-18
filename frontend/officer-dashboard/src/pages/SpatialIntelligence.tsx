import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Crosshair,
  MapPin,
  MagnifyingGlass,
  WarningCircle,
  ArrowsClockwise,
  UsersThree,
  Stack,
  Buildings,
  CheckCircle,
  Clock,
  GlobeHemisphereEast,
} from "@phosphor-icons/react";
import {
  ExpandableFilterBar,
  type ActiveFilterChip,
} from "../components/ExpandableFilterBar";
import { api } from "../api/client";
import type {
  ActiveCitiesResponse,
  GeocodePlaceResult,
  HotspotListResponse,
  SpatialAnalysisResult,
  SpatialComplaint,
  WardAnalyticsResponse,
} from "../types/spatial";
import SpatialMap from "../components/spatial/SpatialMap";

type AnalysisMode = "hotspots" | "nearby" | "wards";

const DEFAULT_LATITUDE = 17.4156;
const DEFAULT_LONGITUDE = 78.4357;

const CATEGORIES = [
  { value: "all", label: "All categories" },
  { value: "ROAD", label: "Roads" },
  { value: "WATER_SUPPLY", label: "Water supply" },
  { value: "ELECTRICITY", label: "Electricity & Streetlights" },
  { value: "SANITATION", label: "Sanitation & Garbage" },
  { value: "PUBLIC_SAFETY", label: "Public safety" },
];

const TIME_WINDOWS = [
  { value: "", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const NEARBY_RADIUS_PRESETS = [
  { value: 250, label: "250 m" },
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 5000, label: "5 km" },
];

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: "border-rose-300 bg-rose-500/15 text-rose-800",
  HIGH: "border-amber-300 bg-amber-500/15 text-amber-800",
  MEDIUM: "border-blue-200 bg-blue-50 text-blue-800",
  LOW: "border-slate-200 bg-slate-100 text-slate-700",
};

function formatCategory(category: string) {
  return String(category || "OTHER")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatStatus(status: string) {
  return String(status || "")
    .replace(/_/g, " ")
    .toLowerCase();
}

function ComplaintResult({
  complaint,
  selected = false,
  onSelect,
}: {
  complaint: SpatialComplaint;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <article
      onClick={onSelect}
      className={`rounded-xl border p-4 shadow-sm backdrop-blur-md transition ${
        onSelect ? "cursor-pointer hover:border-blue-400" : ""
      } ${
        selected
          ? "border-2 border-primary bg-blue-50/70 ring-2 ring-primary/20"
          : "border-white/70 bg-white/55"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            to={`/officer/complaints/${complaint.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[11px] font-bold text-primary hover:underline"
          >
            {complaint.referenceId || complaint.id.slice(0, 8)}
          </Link>
          <h3 className="mt-1 text-sm font-bold text-ink">{complaint.title}</h3>
        </div>

        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold capitalize text-blue-800">
          {formatStatus(complaint.status)}
        </span>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
        {complaint.address || "Address unavailable"}
        {complaint.ward ? ` · ${complaint.ward}` : ""}
        {complaint.city ? ` · ${complaint.city}` : ""}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-ink-soft">
        <span className="flex items-center gap-1">
          <Stack size={14} />
          {formatCategory(complaint.canonicalCategory)}
        </span>

        {Number.isFinite(complaint.distanceMeters) && (
          <span className="flex items-center gap-1">
            <MapPin size={14} />
            {complaint.distanceMeters.toFixed(1)} m
          </span>
        )}

        {complaint.priority && (
          <span className="capitalize">
            Priority: {complaint.priority.toLowerCase()}
          </span>
        )}

        {onSelect && (
          <span className="ml-auto text-[10px] font-bold text-primary">
            {selected ? "Highlighted on map" : "Show on map"}
          </span>
        )}
      </div>
    </article>
  );
}

export default function SpatialIntelligence() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();

  const initialRouteFocus = useMemo(() => {
    const pCity = searchParams.get("city");
    const pLat = searchParams.get("lat");
    const pLng = searchParams.get("lng");
    const pHotspotId = searchParams.get("hotspotId");
    const pWard = searchParams.get("ward");
    const pRef = searchParams.get("ref");
    const latNum = pLat !== null && pLat !== "" ? Number(pLat) : NaN;
    const lngNum = pLng !== null && pLng !== "" ? Number(pLng) : NaN;
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    return {
      city: pCity || "all",
      lat: hasCoords ? latNum : null,
      lng: hasCoords ? lngNum : null,
      hotspotId: pHotspotId || null,
      ward: pWard || null,
      ref: pRef || null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsKey]);

  const [mode, setMode] = useState<AnalysisMode>("hotspots");

  // Shared jurisdiction directory
  const [citiesData, setCitiesData] = useState<ActiveCitiesResponse | null>(null);

  // Persisted Hotspots state
  const [hotspotCity, setHotspotCity] = useState<string>(initialRouteFocus.city);
  const [focusedLocation, setFocusedLocation] = useState<{
    latitude: number;
    longitude: number;
    hotspotId?: string | null;
    label?: string | null;
  } | null>(() =>
    initialRouteFocus.lat !== null && initialRouteFocus.lng !== null
      ? {
          latitude: initialRouteFocus.lat,
          longitude: initialRouteFocus.lng,
          hotspotId: initialRouteFocus.hotspotId,
          label:
            [
              initialRouteFocus.ward,
              initialRouteFocus.city !== "all" ? initialRouteFocus.city : null,
            ]
              .filter(Boolean)
              .join(" · ") || null,
        }
      : null,
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<GeocodePlaceResult[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [locating, setLocating] = useState(false);

  const [overlapOnly, setOverlapOnly] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [hotspotCategory, setHotspotCategory] = useState<string>("all");
  const [minHotspotCount, setMinHotspotCount] = useState<number>(0);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [hotspotsData, setHotspotsData] = useState<HotspotListResponse | null>(
    null,
  );
  const [detectingHotspots, setDetectingHotspots] = useState(false);

  // Nearby Search state (interactive map picker — no manual coordinate inputs)
  const [nearbyCenter, setNearbyCenter] = useState<{
    latitude: number;
    longitude: number;
  }>({
    latitude: initialRouteFocus.lat ?? DEFAULT_LATITUDE,
    longitude: initialRouteFocus.lng ?? DEFAULT_LONGITUDE,
  });
  const [nearbyLocationLabel, setNearbyLocationLabel] = useState<string>(
    "Default city center — click map or drag pin to choose a location",
  );
  const [nearbyRadius, setNearbyRadius] = useState<number>(1000);
  const [nearbyCategory, setNearbyCategory] = useState<string>("all");
  const [nearbyTimeWindow, setNearbyTimeWindow] = useState<string>("30");
  const [nearbyMaxResults, setNearbyMaxResults] = useState<string>("100");
  const [nearbyResult, setNearbyResult] =
    useState<SpatialAnalysisResult | null>(null);
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(
    null,
  );
  const [nearbyLocating, setNearbyLocating] = useState(false);

  // Ward & Zone Analytics independent state
  const [wardsCity, setWardsCity] = useState<string>("all");
  const [wardsCategory, setWardsCategory] = useState<string>("all");
  const [wardsTimeWindow, setWardsTimeWindow] = useState<string>("");
  const [wardsData, setWardsData] = useState<WardAnalyticsResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(() => {
    if (initialRouteFocus.lat !== null && initialRouteFocus.lng !== null) {
      const placeDesc =
        [
          initialRouteFocus.ward,
          initialRouteFocus.city !== "all" ? initialRouteFocus.city : null,
        ]
          .filter(Boolean)
          .join(", ") || "selected location";
      const refPart = initialRouteFocus.ref
        ? ` for #${initialRouteFocus.ref}`
        : "";
      return `Centered on ${placeDesc}${refPart} (${initialRouteFocus.lat.toFixed(4)}, ${initialRouteFocus.lng.toFixed(4)}).`;
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);

  async function loadCities() {
    try {
      const data = await api.getSpatialCities();
      setCitiesData(data);
      // Center Nearby Search picker on the top active city if no route focus was specified
      if (
        initialRouteFocus.lat === null &&
        data.cities.length > 0 &&
        data.cities[0].center
      ) {
        setNearbyCenter(data.cities[0].center);
        setNearbyLocationLabel(
          `${data.cities[0].city} center — click map or drag pin to adjust`,
        );
      }
    } catch {
      // fall back gracefully to default coordinates & All Cities
    }
  }

  async function loadHotspots(
    onlyOverlap = overlapOnly,
    city = hotspotCity,
  ) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getHotspots({
        city: city !== "all" ? city : undefined,
        overlapOnly: onlyOverlap,
        limit: 50,
      });
      setHotspotsData(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load persisted hotspots.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadWardAnalytics(
    winDays = wardsTimeWindow,
    cat = wardsCategory,
    city = wardsCity,
  ) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getWardAnalytics({
        city: city !== "all" ? city : undefined,
        timeWindowDays: winDays ? Number(winDays) : undefined,
        category: cat === "all" ? undefined : cat,
      });
      setWardsData(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load ward analytics.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!searchParamsKey) return;
    setHotspotCity(initialRouteFocus.city);
    setMode("hotspots");
    if (initialRouteFocus.lat !== null && initialRouteFocus.lng !== null) {
      setNearbyCenter({
        latitude: initialRouteFocus.lat,
        longitude: initialRouteFocus.lng,
      });
      setFocusedLocation({
        latitude: initialRouteFocus.lat,
        longitude: initialRouteFocus.lng,
        hotspotId: initialRouteFocus.hotspotId,
        label:
          [
            initialRouteFocus.ward,
            initialRouteFocus.city !== "all" ? initialRouteFocus.city : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
      });
      const placeDesc =
        [
          initialRouteFocus.ward,
          initialRouteFocus.city !== "all" ? initialRouteFocus.city : null,
        ]
          .filter(Boolean)
          .join(", ") || "selected location";
      const refPart = initialRouteFocus.ref
        ? ` for #${initialRouteFocus.ref}`
        : "";
      setNotice(
        `Centered on ${placeDesc}${refPart} (${initialRouteFocus.lat.toFixed(4)}, ${initialRouteFocus.lng.toFixed(4)}).`,
      );
    }
  }, [searchParamsKey, initialRouteFocus]);

  useEffect(() => {
    if (mode === "hotspots") {
      void loadHotspots(overlapOnly, hotspotCity);
    } else if (mode === "wards") {
      void loadWardAnalytics(wardsTimeWindow, wardsCategory, wardsCity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, overlapOnly, hotspotCity, wardsCity, wardsCategory, wardsTimeWindow]);

  async function runNearbyAnalysis(
    centerOverride = nearbyCenter,
    radiusOverride = nearbyRadius,
  ) {
    const validRadius = Math.min(50000, Math.max(50, Math.round(radiusOverride)));
    const parsedMax = Math.min(500, Math.max(1, Number(nearbyMaxResults) || 100));

    setLoading(true);
    setError(null);
    setNotice(null);
    setSelectedComplaintId(null);

    try {
      const response = await api.analyzeSpatialArea({
        latitude: centerOverride.latitude,
        longitude: centerOverride.longitude,
        radiusMeters: validRadius,
        maxResults: parsedMax,
        category: nearbyCategory === "all" ? undefined : nearbyCategory,
        timeWindowDays: nearbyTimeWindow ? Number(nearbyTimeWindow) : undefined,
      });
      setNearbyResult(response.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to complete nearby spatial query.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSelectHotspotCity(
    cityName: string,
    center?: { latitude: number; longitude: number } | null,
  ) {
    setHotspotCity(cityName);
    setFocusedLocation(null);
    setNotice(null);
    setError(null);
    setPlaceResults([]);
    if (searchParamsKey) {
      setSearchParams({}, { replace: true });
    }
    if (center) {
      setNearbyCenter(center);
      setNearbyLocationLabel(`${cityName} center`);
    }
  }

  async function handlePlaceSearch(e: FormEvent) {
    e.preventDefault();
    if (!placeQuery.trim()) {
      setPlaceResults([]);
      return;
    }
    setSearchingPlace(true);
    setError(null);
    try {
      const res = await api.geocodePlace(placeQuery.trim());
      setPlaceResults(res.results || []);
      if (!res.results || res.results.length === 0) {
        setNotice(
          `No matching cities or localities found for "${placeQuery.trim()}".`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Place search failed.");
    } finally {
      setSearchingPlace(false);
    }
  }

  function handlePickPlace(place: GeocodePlaceResult) {
    setPlaceQuery(place.label);
    setPlaceResults([]);
    setFocusedLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.label,
    });
    setError(null);
    if (searchParamsKey) {
      setSearchParams({}, { replace: true });
    }

    const matchedActive = citiesData?.cities.find(
      (c) => c.city.toLowerCase() === String(place.city || "").toLowerCase(),
    );

    if (matchedActive) {
      setHotspotCity(matchedActive.city);
      setNotice(`Filtered hotspots to ${matchedActive.city} (${place.label}).`);
    } else {
      setHotspotCity("all");
      setNotice(`Centered map on ${place.label}.`);
    }
  }

  function handleHotspotUseMyLocation() {
    if (!navigator.geolocation) {
      setError("Browser geolocation is not available.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setHotspotCity("all");
        setFocusedLocation({
          latitude: lat,
          longitude: lng,
          label: "Your GPS location",
        });
        if (searchParamsKey) {
          setSearchParams({}, { replace: true });
        }
        setLocating(false);
        setNotice(`Centered hotspot map on your GPS location (${lat}, ${lng}).`);
      },
      () => {
        setLocating(false);
        setError("Could not access browser GPS location.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function handleNearbyUseMyLocation() {
    if (!navigator.geolocation) {
      setError("Browser geolocation is not available.");
      return;
    }
    setNearbyLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        };
        setNearbyCenter(coords);
        setNearbyLocationLabel("Your GPS location");
        setNearbyLocating(false);
        setNotice(
          `Search center moved to your GPS location (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}). Click Run Nearby Analysis to search.`,
        );
      },
      () => {
        setNearbyLocating(false);
        setError("Could not access browser GPS location.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function handleDetectHotspots() {
    setDetectingHotspots(true);
    setError(null);
    setNotice(null);

    try {
      const res = await api.detectHotspots({
        cityWide: true,
        city: hotspotCity !== "all" ? hotspotCity : undefined,
        category: hotspotCategory === "all" ? undefined : hotspotCategory,
      });

      setNotice(
        `Hotspot scan complete${hotspotCity !== "all" ? ` for ${hotspotCity}` : " across all cities"}: ${res.detectedCount} hotspot(s) detected and persisted (${res.crossCategoryOverlapCount} cross-category overlap alert${res.crossCategoryOverlapCount === 1 ? "" : "s"}).`,
      );
      await Promise.all([
        loadHotspots(overlapOnly, hotspotCity),
        loadCities(),
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to run hotspot detection.",
      );
    } finally {
      setDetectingHotspots(false);
    }
  }

  const filteredHotspots = useMemo(() => {
    if (!hotspotsData) return [];
    return hotspotsData.hotspots.filter((h) => {
      if (
        severityFilter !== "all" &&
        h.severity.toUpperCase() !== severityFilter
      ) {
        return false;
      }
      if (minHotspotCount > 0 && h.complaintCount < minHotspotCount) {
        return false;
      }
      if (
        hotspotCategory !== "all" &&
        !(h.overlapCategories || []).includes(hotspotCategory) &&
        !(h.issueCategories || []).includes(hotspotCategory) &&
        h.dominantCategory !== hotspotCategory
      ) {
        return false;
      }
      return true;
    });
  }, [hotspotsData, severityFilter, minHotspotCount, hotspotCategory]);

  const activeHotspots =
    mode === "hotspots" && hotspotsData
      ? {
          total: filteredHotspots.length,
          openComplaints: filteredHotspots.reduce(
            (sum, h) => sum + (h.openCount ?? 0),
            0,
          ),
          crossCategoryOverlapCount: filteredHotspots.filter(
            (h) => h.hasCrossCategoryOverlap,
          ).length,
          hotspots: filteredHotspots,
        }
      : null;

  const activeNearby = mode === "nearby" ? nearbyResult : null;
  const activeWards = mode === "wards" ? wardsData : null;

  const hotspotFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (hotspotCity !== "all") {
      chips.push({
        key: "city",
        label: `City: ${hotspotCity}`,
        onRemove: () => handleSelectHotspotCity("all", null),
      });
    }
    if (overlapOnly) {
      chips.push({
        key: "overlap",
        label: "Cross-Category Overlaps Only",
        onRemove: () => setOverlapOnly(false),
      });
    }
    if (severityFilter !== "all") {
      chips.push({
        key: "severity",
        label: `Severity: ${severityFilter}`,
        onRemove: () => setSeverityFilter("all"),
      });
    }
    if (hotspotCategory !== "all") {
      chips.push({
        key: "cat",
        label: `Category: ${CATEGORIES.find((c) => c.value === hotspotCategory)?.label || hotspotCategory}`,
        onRemove: () => setHotspotCategory("all"),
      });
    }
    if (minHotspotCount > 0) {
      chips.push({
        key: "minCount",
        label: `≥ ${minHotspotCount} Reports`,
        onRemove: () => setMinHotspotCount(0),
      });
    }
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hotspotCity,
    overlapOnly,
    severityFilter,
    hotspotCategory,
    minHotspotCount,
  ]);

  function handleResetHotspotFilters() {
    setOverlapOnly(false);
    setSeverityFilter("all");
    setHotspotCategory("all");
    setMinHotspotCount(0);
    if (hotspotCity !== "all") {
      handleSelectHotspotCity("all", null);
    }
  }

  const wardMarkers = activeWards
    ? activeWards.wards
        .filter((w) => w.center != null)
        .map((w) => ({
          city: w.city ?? null,
          ward: w.ward,
          zone: w.zone,
          totalComplaints: w.totalComplaints,
          openComplaints: w.openComplaints,
          densityPerSqKm: w.densityPerSqKm,
          activeHotspots: w.activeHotspots,
          overlapHotspots: w.overlapHotspots,
          center: w.center!,
        }))
    : undefined;

  const hotspotMapCenter = focusedLocation
    ? {
        latitude: focusedLocation.latitude,
        longitude: focusedLocation.longitude,
      }
    : activeHotspots && activeHotspots.hotspots.length > 0
      ? activeHotspots.hotspots[0].centroid
      : { latitude: DEFAULT_LATITUDE, longitude: DEFAULT_LONGITUDE };

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700">
            <Crosshair size={13} weight="bold" />
            Spatial Intelligence
          </span>

          <h1 className="pt-1.5 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Spatial Intelligence &amp; Hotspots
          </h1>

          <p className="text-sm font-medium text-ink-soft">
            Persisted infrastructure hotspots, map-based nearby search, and ward &amp; zone analytics.
          </p>
        </div>

        {mode === "hotspots" && (
          <button
            type="button"
            onClick={() => void handleDetectHotspots()}
            disabled={detectingHotspots}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-primary-strong disabled:opacity-60 cursor-pointer sm:self-auto"
          >
            <ArrowsClockwise
              size={15}
              className={detectingHotspots ? "animate-spin" : ""}
            />
            {detectingHotspots
              ? "Scanning..."
              : hotspotCity !== "all"
                ? `Detect & Refresh Hotspots (${hotspotCity})`
                : "Detect & Refresh Hotspots"}
          </button>
        )}
      </div>

      {/* Three-Tab Navigation: Persisted Hotspots | Nearby Search | Ward & Zone Analytics */}
      <div className="glass-panel grid grid-cols-1 gap-2 p-2 sm:grid-cols-3">
        {[
          {
            key: "hotspots" as const,
            title: "Persisted Hotspots",
            subtitle: "Saved zones & overlap alerts",
            icon: UsersThree,
          },
          {
            key: "nearby" as const,
            title: "Nearby Search",
            subtitle: "Interactive map radius search",
            icon: MagnifyingGlass,
          },
          {
            key: "wards" as const,
            title: "Ward & Zone Analytics",
            subtitle: "Administrative density & backlog",
            icon: Buildings,
          },
        ].map(({ key, title, subtitle, icon: Icon }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode(key);
                setError(null);
                setNotice(null);
              }}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition cursor-pointer ${
                active
                  ? "bg-primary text-white shadow-md"
                  : "text-ink-soft hover:bg-white/60"
              }`}
            >
              <Icon size={20} weight="duotone" className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{title}</span>
                <span
                  className={`block truncate text-[11px] ${
                    active ? "text-white/80" : "text-ink-soft"
                  }`}
                >
                  {subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300/70 bg-emerald-500/15 px-4 py-3 text-xs font-semibold text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle
              size={17}
              weight="fill"
              className="shrink-0 text-emerald-700"
            />
            <span>{notice}</span>
          </div>
          {mode === "hotspots" && focusedLocation && (
            <button
              type="button"
              onClick={() => {
                setFocusedLocation(null);
                setNotice(null);
                if (searchParamsKey) {
                  setSearchParams({}, { replace: true });
                }
              }}
              className="rounded-lg border border-emerald-400/60 bg-white/70 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:bg-white cursor-pointer"
            >
              Reset Focus
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"
        >
          <WarningCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Spatial request failed</p>
            <p className="mt-1 text-xs leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: PERSISTED HOTSPOTS                                         */}
      {/* ================================================================= */}
      {mode === "hotspots" && (
        <section className="flex flex-col gap-5">
          {/* Search & Filter bar — rendered ONLY for Persisted Hotspots */}
          <ExpandableFilterBar
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((prev) => !prev)}
            activeCount={hotspotFilterChips.length}
            chips={hotspotFilterChips}
            onResetAll={handleResetHotspotFilters}
            panelTitle="Persisted Hotspot Filters"
            leading={
              <div className="relative flex flex-1 flex-wrap items-center gap-2 min-w-[240px]">
                <form
                  onSubmit={(e) => void handlePlaceSearch(e)}
                  className="flex flex-1 items-center gap-1.5 max-w-sm"
                >
                  <div className="relative flex-1">
                    <MagnifyingGlass
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
                    />
                    <input
                      type="text"
                      value={placeQuery}
                      onChange={(e) => setPlaceQuery(e.target.value)}
                      placeholder="Jump to city, town, or ward..."
                      aria-label="Search city or place"
                      className="glass-input w-full py-2 pl-8 pr-3 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searchingPlace}
                    className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60 cursor-pointer"
                  >
                    {searchingPlace ? "Finding..." : "Go"}
                  </button>
                </form>

                {placeResults.length > 0 && (
                  <div className="absolute left-0 top-11 z-[1100] w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                      <span>Matching Places</span>
                      <button
                        type="button"
                        onClick={() => setPlaceResults([])}
                        className="text-primary hover:underline cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
                      {placeResults.map((place, idx) => (
                        <li key={`${place.label}-${idx}`}>
                          <button
                            type="button"
                            onClick={() => handlePickPlace(place)}
                            className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50/70 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-ink truncate">
                                {place.label}
                              </p>
                              <p className="text-[10px] text-ink-soft">
                                {place.city} · {place.latitude.toFixed(4)},{" "}
                                {place.longitude.toFixed(4)}
                              </p>
                            </div>
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              {place.source === "active-complaints"
                                ? "Active DB"
                                : place.source}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            }
            trailing={
              <button
                type="button"
                onClick={handleHotspotUseMyLocation}
                disabled={locating}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/75 bg-white/75 px-3 py-2 text-xs font-bold text-primary hover:bg-white cursor-pointer disabled:opacity-60"
              >
                <Crosshair size={14} weight="bold" />
                {locating ? "Locating..." : "Use My Location"}
              </button>
            }
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                  <GlobeHemisphereEast size={13} className="text-primary" />
                  Jurisdiction (City)
                </label>
                <select
                  value={hotspotCity}
                  onChange={(e) => {
                    const cName = e.target.value;
                    const found = (citiesData?.cities || []).find(
                      (c) => c.city === cName,
                    );
                    handleSelectHotspotCity(cName, found?.center ?? null);
                  }}
                  aria-label="Filter hotspots by city"
                  className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
                >
                  <option value="all">All Cities</option>
                  {(citiesData?.cities || []).map((c) => (
                    <option key={c.city} value={c.city}>
                      {c.city} ({c.complaintCount})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                  Overlap Filter
                </label>
                <select
                  value={overlapOnly ? "OVERLAP" : "ALL"}
                  onChange={(e) => setOverlapOnly(e.target.value === "OVERLAP")}
                  aria-label="Filter hotspots by cross-category overlap"
                  className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
                >
                  <option value="ALL">All Hotspots</option>
                  <option value="OVERLAP">Cross-Category Overlaps Only</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                  Hotspot Severity
                </label>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  aria-label="Filter hotspots by severity"
                  className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
                >
                  <option value="all">All Severities</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                  Complaint Category
                </label>
                <select
                  value={hotspotCategory}
                  onChange={(e) => setHotspotCategory(e.target.value)}
                  aria-label="Filter hotspots by category"
                  className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                  Min Complaints
                </label>
                <select
                  value={String(minHotspotCount)}
                  onChange={(e) => setMinHotspotCount(Number(e.target.value))}
                  aria-label="Filter hotspots by minimum complaint count"
                  className="glass-input px-3 py-2 text-xs font-semibold cursor-pointer"
                >
                  <option value="0">Any Size</option>
                  <option value="2">≥ 2 Complaints</option>
                  <option value="3">≥ 3 Complaints</option>
                  <option value="5">≥ 5 Complaints</option>
                </select>
              </div>
            </div>
          </ExpandableFilterBar>

          {/* Hotspot Map */}
          {activeHotspots && (
            <>
              <div className="flex flex-col gap-3">
                <ResultHeading
                  title="Hotspot Map"
                  description="Persisted complaint concentrations across municipal wards. Amber and red markers highlight cross-category overlaps and critical zones."
                />
                <SpatialMap
                  center={hotspotMapCenter}
                  radiusMeters={1000}
                  showSearchCircle={false}
                  complaints={[]}
                  hotspots={activeHotspots.hotspots}
                  focusedLocation={focusedLocation}
                />
              </div>

              {/* Clean Summary Metrics (without Active Hotspots status metric) */}
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Persisted Hotspots"
                  value={activeHotspots.total}
                />
                <Metric
                  label="Unresolved Complaints"
                  value={activeHotspots.openComplaints}
                />
                <Metric
                  label="Cross-Category Overlaps"
                  value={activeHotspots.crossCategoryOverlapCount}
                  highlight={activeHotspots.crossCategoryOverlapCount > 0}
                />
              </div>

              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Showing {activeHotspots.hotspots.length} hotspot
                {activeHotspots.hotspots.length === 1 ? "" : "s"}
              </p>

              {activeHotspots.hotspots.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {[...activeHotspots.hotspots]
                    .sort((a, b) => {
                      const af = focusedLocation?.hotspotId === a.id ? 1 : 0;
                      const bf = focusedLocation?.hotspotId === b.id ? 1 : 0;
                      return bf - af;
                    })
                    .map((hotspot) => {
                      const isFocusedHotspot =
                        focusedLocation?.hotspotId === hotspot.id;
                      return (
                        <article
                          key={hotspot.id}
                          className={`glass-panel flex flex-col gap-4 p-5 ${
                            isFocusedHotspot
                              ? "border-2 border-primary/70 ring-2 ring-primary/20"
                              : hotspot.hasCrossCategoryOverlap
                                ? "border-2 border-amber-300/80 bg-amber-50/20"
                                : ""
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                {isFocusedHotspot && (
                                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">
                                    In Focus
                                  </span>
                                )}
                                <span
                                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                                    SEVERITY_BADGE[hotspot.severity] ||
                                    SEVERITY_BADGE.MEDIUM
                                  }`}
                                >
                                  {hotspot.severity} Severity
                                </span>
                                {hotspot.hasCrossCategoryOverlap && (
                                  <span className="rounded-full border border-amber-400 bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                                    Cross-Category Overlap
                                  </span>
                                )}
                                {(hotspot.city ||
                                  hotspot.ward ||
                                  hotspot.zone) && (
                                  <span className="text-[11px] font-semibold text-ink-soft">
                                    {[hotspot.city, hotspot.ward, hotspot.zone]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                )}
                              </div>
                              <h3 className="mt-1.5 text-lg font-extrabold text-ink">
                                {hotspot.title}
                              </h3>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="rounded-xl border border-white/70 bg-white/60 px-3 py-1.5 text-right">
                                <span className="block font-mono text-sm font-extrabold text-ink">
                                  {hotspot.complaintCount} total
                                </span>
                                <span className="block text-[11px] font-semibold text-amber-800">
                                  {hotspot.openCount} unresolved
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setFocusedLocation({
                                    latitude: hotspot.centroid.latitude,
                                    longitude: hotspot.centroid.longitude,
                                    hotspotId: hotspot.id,
                                    label: hotspot.title,
                                  })
                                }
                                className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                              >
                                Center Map
                              </button>
                            </div>
                          </div>

                          {hotspot.hasCrossCategoryOverlap &&
                            hotspot.overlapSummary && (
                              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/80 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950">
                                <WarningCircle
                                  size={17}
                                  weight="fill"
                                  className="mt-0.5 shrink-0 text-amber-600"
                                />
                                <div>
                                  <strong className="block font-bold">
                                    Overlapping Categories:{" "}
                                    {hotspot.overlapCategories
                                      .map(formatCategory)
                                      .join(" + ")}
                                  </strong>
                                  <p className="mt-0.5 leading-relaxed">
                                    {hotspot.overlapSummary}
                                  </p>
                                </div>
                              </div>
                            )}

                          <CategoryCounts counts={hotspot.categoryCounts} />

                          {hotspot.complaints.length > 0 && (
                            <div className="grid gap-2.5 sm:grid-cols-2">
                              {hotspot.complaints.map((complaint) => (
                                <ComplaintResult
                                  key={complaint.id}
                                  complaint={complaint}
                                />
                              ))}
                            </div>
                          )}
                        </article>
                      );
                    })}
                </div>
              ) : (
                <EmptyState message="No persisted hotspots match these filters. Click 'Detect & Refresh Hotspots' above to scan geocoded complaints." />
              )}
            </>
          )}

          {loading && !activeHotspots && (
            <div className="glass-panel flex items-center justify-center gap-2 py-12 text-xs font-semibold text-ink-soft">
              <ArrowsClockwise size={16} className="animate-spin text-primary" />
              Loading persisted hotspots...
            </div>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* TAB 2: NEARBY SEARCH (INTERACTIVE MAP LOCATION PICKER)            */}
      {/* ================================================================= */}
      {mode === "nearby" && (
        <section className="flex flex-col gap-5">
          {/* Interactive Map Picker — Visible Immediately */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ResultHeading
                title="Select Search Area on Map"
                description="Click anywhere on the map or drag the blue pin to choose your center. The shaded circle reflects your search radius."
              />
              <div className="flex flex-wrap items-center gap-2">
                {citiesData && citiesData.cities.length > 0 && (
                  <select
                    aria-label="Center map on city"
                    value=""
                    onChange={(e) => {
                      const found = citiesData.cities.find(
                        (c) => c.city === e.target.value,
                      );
                      if (found?.center) {
                        setNearbyCenter(found.center);
                        setNearbyLocationLabel(`${found.city} center`);
                        setSelectedComplaintId(null);
                      }
                    }}
                    className="glass-input px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    <option value="">Jump to city...</option>
                    {citiesData.cities.map((c) => (
                      <option key={c.city} value={c.city}>
                        {c.city} ({c.complaintCount})
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={handleNearbyUseMyLocation}
                  disabled={nearbyLocating}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/75 bg-white/75 px-3 py-1.5 text-xs font-bold text-primary hover:bg-white cursor-pointer disabled:opacity-60"
                >
                  <Crosshair size={14} weight="bold" />
                  {nearbyLocating ? "Locating..." : "Use My Location"}
                </button>
              </div>
            </div>

            <SpatialMap
              center={nearbyCenter}
              radiusMeters={nearbyRadius}
              showSearchCircle
              enableLocationPicker
              complaints={activeNearby ? activeNearby.complaints : []}
              selectedComplaintId={selectedComplaintId}
              onComplaintSelect={(id) => setSelectedComplaintId(id)}
              onCenterSelect={(coords) => {
                setNearbyCenter(coords);
                setNearbyLocationLabel("Selected map location");
                setSelectedComplaintId(null);
              }}
            />

            {/* Selected Location Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/60 px-3.5 py-2 text-xs text-indigo-950">
              <span className="flex items-center gap-2 font-semibold">
                <MapPin size={15} weight="fill" className="text-primary" />
                <span>{nearbyLocationLabel}</span>
              </span>
              <span className="font-mono text-[11px] font-bold text-indigo-800">
                {nearbyCenter.latitude.toFixed(5)},{" "}
                {nearbyCenter.longitude.toFixed(5)} · Radius:{" "}
                {nearbyRadius >= 1000
                  ? `${(nearbyRadius / 1000).toFixed(nearbyRadius % 1000 === 0 ? 0 : 1)} km`
                  : `${nearbyRadius} m`}
              </span>
            </div>
          </div>

          {/* Nearby Search Controls (No manual lat/lng inputs) */}
          <div className="glass-panel flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-ink">Search radius</span>
              <div className="flex flex-wrap items-center gap-2">
                {NEARBY_RADIUS_PRESETS.map((preset) => {
                  const isSelected = nearbyRadius === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setNearbyRadius(preset.value)}
                      className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                        isSelected
                          ? "bg-primary text-white shadow-sm"
                          : "border border-white/75 bg-white/70 text-ink-soft hover:bg-white hover:text-ink"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
                <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-ink-soft">
                  <span>Custom (m):</span>
                  <input
                    type="number"
                    min={50}
                    max={50000}
                    step={50}
                    value={nearbyRadius}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) {
                        setNearbyRadius(Math.max(50, Math.min(50000, val)));
                      }
                    }}
                    aria-label="Custom search radius in metres"
                    className="glass-input w-28 px-2.5 py-1.5 text-xs font-mono font-bold text-ink"
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Complaint category">
                <select
                  value={nearbyCategory}
                  onChange={(e) => setNearbyCategory(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-sm"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Time window">
                <select
                  value={nearbyTimeWindow}
                  onChange={(e) => setNearbyTimeWindow(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-sm"
                >
                  {TIME_WINDOWS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Maximum results">
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={nearbyMaxResults}
                  onChange={(e) => setNearbyMaxResults(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-sm"
                />
              </Field>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-relaxed text-ink-soft">
                Adjust the pin or search radius on the map at any time and run the analysis again.
              </p>
              <button
                type="button"
                onClick={() => void runNearbyAnalysis()}
                disabled={loading}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <ArrowsClockwise size={15} className="animate-spin" />
                ) : (
                  <MagnifyingGlass size={15} weight="bold" />
                )}
                {loading ? "Analyzing..." : "Run Nearby Analysis"}
              </button>
            </div>
          </div>

          {/* Nearby Search Results */}
          {activeNearby ? (
            <div className="flex flex-col gap-4">
              <ResultHeading
                title="Nearby Complaints"
                description={`${activeNearby.returnedCount} complaint(s) returned within ${activeNearby.radiusMeters} metres. Select any complaint card to highlight it on the map.`}
              />

              {activeNearby.hasCrossCategoryOverlap &&
                activeNearby.overlapAlert && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50/90 px-4 py-3 text-xs font-medium text-amber-950">
                    <WarningCircle
                      size={18}
                      weight="fill"
                      className="mt-0.5 shrink-0 text-amber-600"
                    />
                    <span>{activeNearby.overlapAlert}</span>
                  </div>
                )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Complaints returned"
                  value={activeNearby.returnedCount}
                />
                <Metric label="Open complaints" value={activeNearby.openCount} />
                <Metric
                  label="Area density"
                  value={`${activeNearby.densityPerSqKm} / km²`}
                />
                <Metric
                  label="Categories found"
                  value={Object.keys(activeNearby.categoryCounts).length}
                />
              </div>

              <CategoryCounts counts={activeNearby.categoryCounts} />

              {activeNearby.cityBreakdown &&
                Object.keys(activeNearby.cityBreakdown).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-ink-soft">Cities:</span>
                    {Object.entries(activeNearby.cityBreakdown).map(
                      ([cityName, count]) => (
                        <span
                          key={cityName}
                          className="rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold text-blue-800"
                        >
                          {cityName} · {count}
                        </span>
                      ),
                    )}
                  </div>
                )}

              {Object.keys(activeNearby.wardBreakdown).length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-ink-soft">Wards:</span>
                  {Object.entries(activeNearby.wardBreakdown).map(
                    ([wardName, count]) => (
                      <span
                        key={wardName}
                        className="rounded-full border border-indigo-200 bg-indigo-50/70 px-3 py-1 text-[11px] font-semibold text-indigo-800"
                      >
                        {wardName} · {count}
                      </span>
                    ),
                  )}
                </div>
              )}

              {activeNearby.complaints.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeNearby.complaints.map((complaint) => (
                    <ComplaintResult
                      key={complaint.id}
                      complaint={complaint}
                      selected={selectedComplaintId === complaint.id}
                      onSelect={() => setSelectedComplaintId(complaint.id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="No complaints were found within this radius. Try dragging the pin to another area or increasing the search radius." />
              )}
            </div>
          ) : (
            !loading &&
            !error && (
              <div className="glass-panel flex flex-col items-center justify-center px-6 py-8 text-center">
                <MagnifyingGlass
                  size={26}
                  className="text-blue-700"
                  weight="duotone"
                />
                <h2 className="mt-2.5 text-sm font-bold text-ink">
                  Click the map or drag the pin, then run your search
                </h2>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-soft">
                  Choose any radius (250 m to 5 km) and click Run Nearby Analysis to inspect complaints, density, and cross-category overlaps in that area.
                </p>
              </div>
            )
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* TAB 3: WARD & ZONE ANALYTICS (RETAINED & INDEPENDENT)             */}
      {/* ================================================================= */}
      {mode === "wards" && (
        <section className="flex flex-col gap-5">
          {/* Independent Ward & Zone Controls (no Persisted Hotspots filter bar) */}
          <div className="glass-panel p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Jurisdiction (City)">
                <select
                  value={wardsCity}
                  onChange={(e) => setWardsCity(e.target.value)}
                  aria-label="Filter ward analytics by city"
                  className="glass-input w-full px-3 py-2.5 text-sm"
                >
                  <option value="all">All Cities</option>
                  {(citiesData?.cities || []).map((c) => (
                    <option key={c.city} value={c.city}>
                      {c.city} ({c.complaintCount})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Complaint category">
                <select
                  value={wardsCategory}
                  onChange={(e) => setWardsCategory(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-sm"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Time window">
                <select
                  value={wardsTimeWindow}
                  onChange={(e) => setWardsTimeWindow(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-sm"
                >
                  {TIME_WINDOWS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-relaxed text-ink-soft">
                Aggregates complaint volume, open backlog, status &amp; category breakdowns, density/km², and hotspots across administrative zones and wards.
              </p>
              <button
                type="button"
                onClick={() =>
                  void loadWardAnalytics(
                    wardsTimeWindow,
                    wardsCategory,
                    wardsCity,
                  )
                }
                disabled={loading}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-primary-strong disabled:opacity-60 cursor-pointer"
              >
                <ArrowsClockwise
                  size={15}
                  className={loading ? "animate-spin" : ""}
                />
                {loading ? "Refreshing..." : "Refresh Ward Analytics"}
              </button>
            </div>
          </div>

          {loading && !activeWards && (
            <div className="glass-panel flex items-center justify-center gap-2 py-12 text-xs font-semibold text-ink-soft">
              <ArrowsClockwise size={16} className="animate-spin text-primary" />
              Loading ward and zone analytics...
            </div>
          )}

          {activeWards && (
            <>
              {wardMarkers && wardMarkers.length > 0 && (
                <div className="flex flex-col gap-3">
                  <ResultHeading
                    title="Ward Distribution Map"
                    description="Municipal ward centroids sized by complaint volume and highlighted when cross-category overlaps exist."
                  />
                  <SpatialMap
                    center={wardMarkers[0].center}
                    radiusMeters={1000}
                    showSearchCircle={false}
                    complaints={[]}
                    wardMarkers={wardMarkers}
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Zones Tracked"
                  value={activeWards.totalZones ?? activeWards.zones?.length ?? 0}
                />
                <Metric label="Wards Tracked" value={activeWards.totalWards} />
                <Metric
                  label="Total Complaints"
                  value={activeWards.totalComplaints}
                />
                <Metric
                  label="Highest Ward Density"
                  value={
                    activeWards.wards[0]
                      ? `${activeWards.wards[0].densityPerSqKm} / km²`
                      : "0 / km²"
                  }
                />
              </div>

              {/* Zone-wise Complaint Distribution */}
              {activeWards.zones && activeWards.zones.length > 0 && (
                <div className="flex flex-col gap-3">
                  <ResultHeading
                    title="Zone-Wise Summary"
                    description={`${activeWards.zones.length} administrative zone(s) aggregating ward-level workload and backlog.`}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    {activeWards.zones.map((zoneItem) => (
                      <article
                        key={`${zoneItem.city || "gen"}-${zoneItem.zone}`}
                        className="glass-panel flex flex-col gap-3 p-5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                              {zoneItem.city ? `${zoneItem.city} · ` : ""}
                              {zoneItem.wardCount} ward
                              {zoneItem.wardCount === 1 ? "" : "s"}
                            </span>
                            <h3 className="mt-0.5 text-base font-extrabold text-ink">
                              {zoneItem.zone}
                            </h3>
                          </div>
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-mono text-xs font-bold text-blue-800">
                            {zoneItem.totalComplaints} reports
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/55 p-3 text-center text-xs">
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-ink-soft">
                              Open
                            </span>
                            <span className="font-mono text-base font-extrabold text-amber-700">
                              {zoneItem.openComplaints}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-ink-soft">
                              Resolved
                            </span>
                            <span className="font-mono text-base font-extrabold text-emerald-700">
                              {zoneItem.resolvedComplaints}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-ink-soft">
                              Hotspots
                            </span>
                            <span className="font-mono text-base font-extrabold text-rose-700">
                              {zoneItem.hotspotCount}
                            </span>
                          </div>
                        </div>

                        <CategoryCounts counts={zoneItem.categoryCounts} />
                        {zoneItem.statusCounts && (
                          <StatusCounts counts={zoneItem.statusCounts} />
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {/* Ward-wise Complaint Distribution */}
              <div className="flex flex-col gap-3">
                <ResultHeading
                  title="Ward-Wise Distribution"
                  description={`${activeWards.totalWards} ward(s) across ${activeWards.totalComplaints} tracked complaints.`}
                />

                {activeWards.wards.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {activeWards.wards.map((wardItem) => (
                      <article
                        key={`${wardItem.city || "gen"}-${wardItem.ward}`}
                        className="glass-panel flex flex-col gap-3 p-5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                              {wardItem.city ? `${wardItem.city} · ` : ""}
                              {wardItem.zone} · {wardItem.areaSqKm} km²
                            </span>
                            <h3 className="mt-0.5 text-base font-extrabold text-ink">
                              {wardItem.ward}
                            </h3>
                          </div>
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-mono text-xs font-bold text-indigo-800">
                            {wardItem.densityPerSqKm} / km²
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 rounded-xl bg-white/55 p-3 text-center text-xs">
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-ink-soft">
                              Total
                            </span>
                            <span className="font-mono text-base font-extrabold text-ink">
                              {wardItem.totalComplaints}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-ink-soft">
                              Open
                            </span>
                            <span className="font-mono text-base font-extrabold text-amber-700">
                              {wardItem.openComplaints}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-ink-soft">
                              Resolved
                            </span>
                            <span className="font-mono text-base font-extrabold text-emerald-700">
                              {wardItem.resolvedComplaints}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase text-ink-soft">
                              Hotspots
                            </span>
                            <span className="font-mono text-base font-extrabold text-rose-700">
                              {wardItem.activeHotspots}
                            </span>
                          </div>
                        </div>

                        <CategoryCounts counts={wardItem.categoryCounts} />
                        {wardItem.statusCounts && (
                          <StatusCounts counts={wardItem.statusCounts} />
                        )}

                        <div className="flex items-center justify-between text-[11px] text-ink-soft">
                          <span className="flex items-center gap-1">
                            <Clock size={13} />
                            Dominant: {formatCategory(wardItem.dominantCategory)}
                          </span>
                          {wardItem.overlapHotspots > 0 && (
                            <span className="font-bold text-amber-700">
                              {wardItem.overlapHotspots} overlap alert
                              {wardItem.overlapHotspots === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No ward-level complaint records match the selected filters." />
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function ResultHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      <p className="mt-1 text-xs text-ink-soft">{description}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`glass-panel p-4 ${
        highlight ? "border border-amber-300/80 bg-amber-50/40" : ""
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-extrabold tracking-tight ${
          highlight ? "text-amber-800" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CategoryCounts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([category, count]) => (
        <span
          key={category}
          className="rounded-full border border-slate-200 bg-white/60 px-3 py-1 text-[11px] font-semibold text-ink-soft"
        >
          {formatCategory(category)} · {count}
        </span>
      ))}
    </div>
  );
}

function StatusCounts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([status, count]) => (
        <span
          key={status}
          className="rounded-full border border-blue-100 bg-blue-50/60 px-2.5 py-0.5 text-[10px] font-semibold capitalize text-blue-800"
        >
          {formatStatus(status)}: {count}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass-panel flex flex-col items-center px-6 py-10 text-center">
      <MapPin size={26} className="text-ink-soft/60" />
      <p className="mt-3 text-sm font-semibold text-ink">Nothing to display</p>
      <p className="mt-1 max-w-md text-xs text-ink-soft">{message}</p>
    </div>
  );
}
