import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  CaretRight,
  Crosshair,
  ArrowsClockwise,
  ThumbsUp,
  WarningCircle,
  X,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { StatusBadge } from "../components/StatusBadge";
import {
  ExpandableFilterBar,
  type ActiveFilterChip,
} from "../components/ExpandableFilterBar";
import { api } from "../api/client";
import type {
  ActiveCitiesResponse,
  ComplaintCategory,
  ComplaintStatus,
  GeocodePlaceResult,
  NearbyComplaint,
} from "../types/complaint";

const DEFAULT_CENTER: [number, number] = [17.4156, 78.4357];

const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  roads: "Roads",
  water_supply: "Water Supply",
  electricity: "Electricity",
  sanitation: "Sanitation",
  public_safety: "Public Safety",
  other: "Other",
};

const RADIUS_OPTIONS = [
  { value: 2000, label: "Within 2 km" },
  { value: 5000, label: "Within 5 km" },
  { value: 10000, label: "Within 10 km" },
  { value: 25000, label: "Within 25 km" },
  { value: 50000, label: "Citywide (50 km)" },
];

function mapStatus(status: string): ComplaintStatus {
  switch (String(status).toUpperCase()) {
    case "RESOLVED":
      return "resolved";
    case "REJECTED":
      return "rejected";
    case "UNDER_REVIEW":
    case "ASSIGNED":
    case "IN_PROGRESS":
    case "NEEDS_INFORMATION":
    case "DUPLICATE_SUSPECTED":
      return "in_progress";
    case "SUBMITTED":
    default:
      return "open";
  }
}

function getStatusPinHex(status: string): string {
  switch (mapStatus(status)) {
    case "in_progress":
      return "#2563eb";
    case "resolved":
      return "#10b981";
    case "rejected":
      return "#e11d48";
    case "open":
    default:
      return "#f59e0b";
  }
}

function createPinIcon(status: string, isSelected: boolean) {
  const fill = getStatusPinHex(status);
  const size = isSelected ? 32 : 24;
  const ring = isSelected
    ? "box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.28), 0 4px 12px rgba(15, 23, 42, 0.35);"
    : "box-shadow: 0 3px 10px rgba(15, 23, 42, 0.28);";

  return L.divIcon({
    className: "citizen-map-pin",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: ${fill};
        border: 3px solid #ffffff;
        ${ring}
        transition: all 0.15s ease;
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

function formatCategoryName(raw: string) {
  return raw
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function MapViewportController({
  center,
  pins,
  selected,
}: {
  center: [number, number];
  pins: NearbyComplaint[];
  selected: NearbyComplaint | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (selected) {
      map.flyTo([selected.latitude, selected.longitude], 16, {
        duration: 0.45,
      });
      return;
    }

    if (pins.length === 0) {
      map.setView(center, 13);
      return;
    }

    if (pins.length === 1) {
      map.setView([pins[0].latitude, pins[0].longitude], 15);
      return;
    }

    const bounds = L.latLngBounds(
      pins.map((p) => [p.latitude, p.longitude] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15 });
  }, [map, center, pins, selected]);

  return null;
}

export default function CivicMap() {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [radiusMeters, setRadiusMeters] = useState<number>(25000);
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "all">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [citiesData, setCitiesData] = useState<ActiveCitiesResponse | null>(null);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<GeocodePlaceResult[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);

  const [pins, setPins] = useState<NearbyComplaint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [upvotingId, setUpvotingId] = useState<string | null>(null);
  const [upvoteNotice, setUpvoteNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSpatialCities()
      .then(setCitiesData)
      .catch(() => {});
  }, []);

  const loadNearby = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.getNearbyComplaints(
        center[0],
        center[1],
        radiusMeters,
        categoryFilter,
        cityFilter,
      );
      const valid = (response.data || []).filter(
        (item) =>
          Number.isFinite(Number(item.latitude)) &&
          Number.isFinite(Number(item.longitude)),
      );
      setPins(valid);
      setSelectedId((prev) =>
        prev && valid.some((item) => item.id === prev) ? prev : null,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to fetch nearby civic issues from backend.",
      );
    } finally {
      setLoading(false);
    }
  }, [center, radiusMeters, categoryFilter, cityFilter]);

  useEffect(() => {
    void loadNearby();
  }, [loadNearby]);

  function handleSelectCity(cityName: string) {
    setCityFilter(cityName);
    setSelectedId(null);
    setPlaceResults([]);
    if (cityName !== "all") {
      const found = citiesData?.cities.find(
        (c) => c.city.toLowerCase() === cityName.toLowerCase(),
      );
      if (found?.center) {
        setCenter([found.center.latitude, found.center.longitude]);
      }
    }
  }

  async function handlePlaceSearch(e: FormEvent) {
    e.preventDefault();
    if (!placeQuery.trim()) {
      setPlaceResults([]);
      return;
    }
    setSearchingPlace(true);
    try {
      const res = await api.geocodePlace(placeQuery.trim());
      setPlaceResults(res.results || []);
    } catch {
      setPlaceResults([]);
    } finally {
      setSearchingPlace(false);
    }
  }

  function handlePickPlace(place: GeocodePlaceResult) {
    setPlaceQuery(place.label);
    setPlaceResults([]);
    setSelectedId(null);
    setCityFilter("all");
    setCenter([place.latitude, place.longitude]);
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }

    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCityFilter("all");
        setCenter([position.coords.latitude, position.coords.longitude]);
        setSelectedId(null);
        setLocating(false);
      },
      () => {
        setError(
          "Could not access browser location. Showing municipal center coordinates instead.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function handleUpvote(item: NearbyComplaint) {
    if (upvotingId) return;
    setUpvotingId(item.id);
    setUpvoteNotice(null);

    try {
      const res = await api.upvoteComplaint(item.id);
      setPins((prev) =>
        prev.map((pin) =>
          pin.id === item.id ? { ...pin, upvoteCount: res.upvoteCount } : pin,
        ),
      );
      setUpvoteNotice(res.message || "Support recorded.");
    } catch (err) {
      setUpvoteNotice(
        err instanceof Error ? err.message : "Could not record upvote.",
      );
    } finally {
      setUpvotingId(null);
    }
  }

  const visiblePins = useMemo(
    () =>
      statusFilter === "all"
        ? pins
        : pins.filter((pin) => mapStatus(pin.status) === statusFilter),
    [pins, statusFilter],
  );

  const selected = useMemo(
    () => visiblePins.find((pin) => pin.id === selectedId) ?? null,
    [visiblePins, selectedId],
  );

  const filterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (cityFilter !== "all") {
      chips.push({
        key: "city",
        label: `City: ${cityFilter}`,
        onRemove: () => handleSelectCity("all"),
      });
    }
    if (radiusMeters !== 25000) {
      const opt = RADIUS_OPTIONS.find((r) => r.value === radiusMeters);
      chips.push({
        key: "radius",
        label: opt ? opt.label : `${(radiusMeters / 1000).toFixed(0)} km`,
        onRemove: () => setRadiusMeters(25000),
      });
    }
    if (categoryFilter !== "all") {
      chips.push({
        key: "category",
        label: `Category: ${CATEGORY_LABELS[categoryFilter] ?? categoryFilter}`,
        onRemove: () => setCategoryFilter("all"),
      });
    }
    if (statusFilter !== "all") {
      chips.push({
        key: "status",
        label: `Status: ${statusFilter.replace("_", " ")}`,
        onRemove: () => setStatusFilter("all"),
      });
    }
    return chips;
  }, [cityFilter, radiusMeters, categoryFilter, statusFilter]);

  const activeFilterCount =
    (cityFilter !== "all" ? 1 : 0) +
    (radiusMeters !== 25000 ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0);

  function resetAllFilters() {
    setCityFilter("all");
    setRadiusMeters(25000);
    setCategoryFilter("all");
    setStatusFilter("all");
    setSelectedId(null);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink font-display">
            Civic Map
          </h1>
          <p className="text-xs font-medium text-ink-soft mt-0.5">
            Live municipal reports near you — upvote active issues to boost priority
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadNearby()}
          disabled={loading}
          className="glass-pill inline-flex items-center gap-1.5 self-start rounded-ios-xl border border-white/70 bg-white/60 px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink cursor-pointer disabled:opacity-50 sm:self-auto"
          title="Refresh map"
        >
          <ArrowsClockwise size={14} className={loading ? "animate-spin text-primary" : ""} />
          Refresh
        </button>
      </div>

      {/* Expandable Filter Panel */}
      <ExpandableFilterBar
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen((prev) => !prev)}
        activeCount={activeFilterCount}
        chips={filterChips}
        onResetAll={resetAllFilters}
        panelTitle="Map Scope & Report Filters"
        leading={
          <div className="relative flex flex-wrap items-center gap-2">
            <form onSubmit={(e) => void handlePlaceSearch(e)} className="flex items-center gap-1.5">
              <div className="relative">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft"
                />
                <input
                  type="text"
                  value={placeQuery}
                  onChange={(e) => setPlaceQuery(e.target.value)}
                  placeholder="Search city or locality..."
                  aria-label="Search city or locality"
                  className="w-48 rounded-xl border border-white/80 bg-white/75 py-2 pl-8 pr-3 text-xs font-medium text-ink shadow-sm backdrop-blur-md focus:border-primary focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={searchingPlace}
                className="rounded-xl border border-indigo-200 bg-indigo-50/90 px-2.5 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
              >
                {searchingPlace ? "..." : "Go"}
              </button>
            </form>

            {placeResults.length > 0 && (
              <div className="absolute left-0 top-10 z-[1100] w-72 overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl backdrop-blur-xl">
                <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
                  {placeResults.map((place, idx) => (
                    <li key={`${place.label}-${idx}`}>
                      <button
                        type="button"
                        onClick={() => handlePickPlace(place)}
                        className="flex w-full flex-col px-3 py-2 text-left text-xs hover:bg-blue-50/70 cursor-pointer"
                      >
                        <span className="font-semibold text-ink truncate">{place.label}</span>
                        <span className="text-[10px] text-ink-soft">{place.city}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={locating}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-xs font-semibold text-primary shadow-sm backdrop-blur-md hover:bg-white cursor-pointer disabled:opacity-60"
            >
              <Crosshair size={14} weight="bold" />
              {locating ? "Locating…" : "Use My Location"}
            </button>
          </div>
        }
        trailing={
          <span className="text-[11px] font-semibold text-ink-soft">
            {visiblePins.length} issue{visiblePins.length === 1 ? "" : "s"} shown
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="civic-map-city"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-soft"
            >
              City / Jurisdiction
            </label>
            <select
              id="civic-map-city"
              value={cityFilter}
              onChange={(e) => handleSelectCity(e.target.value)}
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-xs font-semibold text-ink focus:border-primary focus:outline-none cursor-pointer"
              aria-label="Filter by city"
            >
              <option value="all">By Radius (All Cities)</option>
              {(citiesData?.cities || []).map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city} ({c.complaintCount})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="civic-map-radius"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-soft"
            >
              Search Radius
            </label>
            <select
              id="civic-map-radius"
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-xs font-semibold text-ink focus:border-primary focus:outline-none cursor-pointer"
              aria-label="Search radius"
            >
              {RADIUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="civic-map-category"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-soft"
            >
              Issue Category
            </label>
            <select
              id="civic-map-category"
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as ComplaintCategory | "all")
              }
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-xs font-semibold text-ink focus:border-primary focus:outline-none cursor-pointer"
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="civic-map-status"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-soft"
            >
              Status
            </label>
            <select
              id="civic-map-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ComplaintStatus | "all")}
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-xs font-semibold text-ink focus:border-primary focus:outline-none cursor-pointer"
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </ExpandableFilterBar>

      {error && (
        <div
          role="alert"
          className="glass-panel flex items-center justify-between gap-3 rounded-ios-2xl border border-rose-400/40 p-4 text-xs text-rose-800"
        >
          <div className="flex items-center gap-2 font-semibold">
            <WarningCircle size={18} weight="fill" className="text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadNearby()}
            className="rounded-lg bg-white/80 px-3 py-1 font-semibold text-ink hover:bg-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Grid: Live Leaflet Map & Inspector */}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="glass-panel relative h-[480px] overflow-hidden rounded-ios-3xl border border-white/70 shadow-ios-glass">
          <MapContainer
            center={center}
            zoom={13}
            scrollWheelZoom
            className="h-full w-full z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapViewportController center={center} pins={visiblePins} selected={selected} />

            {visiblePins.map((pin) => (
              <Marker
                key={pin.id}
                position={[pin.latitude, pin.longitude]}
                icon={createPinIcon(pin.status, pin.id === selectedId)}
                eventHandlers={{
                  click: () => {
                    setSelectedId(pin.id);
                    setUpvoteNotice(null);
                  },
                }}
              >
                <Popup>
                  <div className="min-w-[180px] space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-primary">
                        #{pin.referenceId}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600">
                        {formatDistance(pin.distanceMeters)}
                      </span>
                    </div>
                    <p className="font-bold text-slate-900">{pin.title}</p>
                    <p className="text-slate-600">
                      {pin.address}
                      {pin.city ? ` · ${pin.city}` : ""}
                    </p>
                    <p className="font-semibold text-blue-700">
                      {pin.upvoteCount} citizen support
                      {pin.upvoteCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <span className="pointer-events-none absolute bottom-3.5 left-3.5 z-[1000] rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-[11px] font-semibold text-ink shadow-md backdrop-blur-md">
            {loading
              ? "Loading nearby issues…"
              : `${visiblePins.length} issue${visiblePins.length === 1 ? "" : "s"} within ${(radiusMeters / 1000).toFixed(0)} km`}
          </span>

          <div className="pointer-events-none absolute right-3.5 top-3.5 z-[1000] flex flex-col gap-1 rounded-2xl border border-white/70 bg-white/85 p-2.5 text-[11px] shadow-md backdrop-blur-md">
            <Legend dotClass="bg-amber-500" label="Open" />
            <Legend dotClass="bg-blue-600" label="In Progress" />
            <Legend dotClass="bg-emerald-500" label="Resolved" />
            <Legend dotClass="bg-rose-600" label="Rejected" />
          </div>
        </div>

        {/* Liquid Glass Inspector / List */}
        <div className="glass-panel flex flex-col rounded-ios-2xl border border-white/70 p-5 shadow-ios-glass min-h-[320px] max-h-[480px]">
          {selected ? (
            <div className="flex flex-col justify-between h-full gap-4 overflow-y-auto">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-primary bg-white/60 border border-white/80 px-2 py-0.5 rounded-md">
                    #{selected.referenceId}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={mapStatus(selected.status)} />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(null);
                        setUpvoteNotice(null);
                      }}
                      className="rounded-full p-1 text-ink-soft hover:bg-white/60 hover:text-ink cursor-pointer"
                      title="Close"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-ink font-display">
                    {selected.title}
                  </h3>
                  <p className="text-xs text-ink-soft mt-1 leading-relaxed">
                    {selected.description}
                  </p>
                </div>

                <div className="rounded-ios-xl border border-white/60 bg-white/40 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-ink font-semibold">
                    <MapPin size={14} className="text-primary shrink-0" />
                    <span className="truncate">{selected.address}</span>
                  </div>
                  {(selected.city || selected.ward) && (
                    <span className="text-[11px] font-medium text-indigo-700 block">
                      {[selected.ward, selected.city].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-soft">
                    <span>
                      Category:{" "}
                      <strong className="text-ink">
                        {formatCategoryName(selected.category)}
                      </strong>
                    </span>
                    <span className="font-semibold text-primary">
                      {formatDistance(selected.distanceMeters)}
                    </span>
                  </div>
                  {selected.department && (
                    <span className="text-[11px] text-ink-soft block">
                      Dept: <strong className="text-ink">{selected.department}</strong>
                    </span>
                  )}
                </div>

                {upvoteNotice && (
                  <p className="rounded-xl border border-blue-200 bg-blue-500/10 px-3 py-2 text-[11px] font-semibold text-blue-800">
                    {upvoteNotice}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-white/40 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={upvotingId === selected.id}
                    onClick={() => void handleUpvote(selected)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300/70 bg-blue-500/10 px-3.5 py-2 text-xs font-bold text-blue-800 hover:bg-blue-500/20 disabled:opacity-60 cursor-pointer"
                  >
                    <ThumbsUp size={14} weight="fill" />
                    {upvotingId === selected.id
                      ? "Saving…"
                      : `Support (${selected.upvoteCount})`}
                  </button>

                  {selected.isOwnComplaint ? (
                    <Link
                      to={`/complaints/${selected.id}`}
                      className="ios-btn-primary inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-white shadow-sm"
                    >
                      <span>Full Details</span>
                      <CaretRight size={13} weight="bold" />
                    </Link>
                  ) : (
                    <span className="text-[11px] font-medium text-ink-soft">
                      Community report
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Nearby Reports ({visiblePins.length})
                </h2>
                <span className="text-[11px] font-semibold text-primary">
                  {(radiusMeters / 1000).toFixed(0)} km radius
                </span>
              </div>

              {loading ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-xs text-ink-soft">
                  <ArrowsClockwise size={16} className="animate-spin text-primary" />
                  Scanning nearby reports…
                </div>
              ) : visiblePins.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center py-10">
                  <MapPin size={26} weight="duotone" className="text-ink-soft/60" />
                  <p className="text-xs font-semibold text-ink">
                    No nearby issues found
                  </p>
                  <p className="text-[11px] text-ink-soft">
                    Try expanding the radius filter or adjusting status/category.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {visiblePins.map((pin) => (
                    <li key={pin.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(pin.id);
                          setUpvoteNotice(null);
                        }}
                        className="group flex w-full flex-col gap-1 rounded-ios-xl border border-white/60 bg-white/35 p-3 text-left transition-all duration-150 hover:bg-white/65 hover:shadow-sm hover:border-white cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-ink group-hover:text-primary transition-colors truncate">
                            {pin.title}
                          </span>
                          <StatusBadge status={mapStatus(pin.status)} />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-ink-soft">
                          <span className="truncate">
                            {pin.city ? `${pin.city} · ` : ""}
                            {pin.address}
                          </span>
                          <span className="shrink-0 font-semibold text-primary">
                            {formatDistance(pin.distanceMeters)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-medium text-ink-soft">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
