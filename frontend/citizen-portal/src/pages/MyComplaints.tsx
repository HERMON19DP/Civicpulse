import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MagnifyingGlass,
  FileText,
  MapPin,
  Clock,
  CaretRight,
  Plus,
} from "@phosphor-icons/react";
import { StatusBadge } from "../components/StatusBadge";
import {
  ExpandableFilterBar,
  type ActiveFilterChip,
} from "../components/ExpandableFilterBar";
import { api, type CreatedComplaint } from "../api/client";
import type { Complaint, ComplaintStatus } from "../types/complaint";

const FILTERS: { key: ComplaintStatus | "all"; label: string }[] = [
  { key: "all", label: "All Statuses" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
];

const CATEGORY_OPTIONS: { key: Complaint["category"] | "all"; label: string }[] = [
  { key: "all", label: "All Categories" },
  { key: "roads", label: "Roads & Infrastructure" },
  { key: "water_supply", label: "Water Supply" },
  { key: "electricity", label: "Electricity & Streetlights" },
  { key: "sanitation", label: "Sanitation & Waste" },
  { key: "public_safety", label: "Public Safety" },
  { key: "other", label: "Other" },
];

type SortOrder = "updated_desc" | "created_desc" | "created_asc";

function mapStatus(status: string): ComplaintStatus {
  switch (status.toUpperCase()) {
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

function mapCategory(category: string): Complaint["category"] {
  const value = category.toLowerCase().trim();

  if (value.includes("road") || value.includes("infrastructure")) {
    return "roads";
  }
  if (value.includes("water")) {
    return "water_supply";
  }
  if (
    value.includes("electric") ||
    value.includes("streetlight") ||
    value.includes("street light")
  ) {
    return "electricity";
  }
  if (value.includes("sanitation") || value.includes("garbage")) {
    return "sanitation";
  }
  if (value.includes("safety")) {
    return "public_safety";
  }

  return "other";
}

function toComplaint(item: CreatedComplaint): Complaint {
  return {
    // Keep the UUID here because the detail route uses the database ID.
    id: item.id,
    title: item.title,
    description: item.description,
    category: mapCategory(item.category),
    status: mapStatus(item.status),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    location: {
      address: item.address ?? "",
      lat: Number(item.latitude),
      lng: Number(item.longitude),
    },
    evidence: [],
    timeline: [],
  };
}

export default function MyComplaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [referenceIds, setReferenceIds] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<ComplaintStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<Complaint["category"] | "all">("all");
  const [sortBy, setSortBy] = useState<SortOrder>("updated_desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadComplaints() {
      setLoading(true);
      setError("");

      try {
        const result = await api.getMyComplaints();

        if (cancelled) return;

        setComplaints(result.data.map(toComplaint));
        setReferenceIds(
          Object.fromEntries(
            result.data.map((item) => [item.id, item.referenceId]),
          ),
        );
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load your complaints. Please try again.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadComplaints();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();

    const list = complaints.filter((complaint) => {
      const matchesFilter = filter === "all" || complaint.status === filter;
      const matchesCategory =
        categoryFilter === "all" || complaint.category === categoryFilter;

      const referenceId = referenceIds[complaint.id] ?? complaint.id;

      const matchesQuery =
        !search ||
        complaint.title.toLowerCase().includes(search) ||
        (complaint.location.address || "").toLowerCase().includes(search) ||
        referenceId.toLowerCase().includes(search);

      return matchesFilter && matchesCategory && matchesQuery;
    });

    return [...list].sort((a, b) => {
      if (sortBy === "created_asc") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === "created_desc") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [complaints, filter, categoryFilter, sortBy, query, referenceIds]);

  const filterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (filter !== "all") {
      const found = FILTERS.find((f) => f.key === filter);
      chips.push({
        key: "status",
        label: `Status: ${found?.label ?? filter}`,
        onRemove: () => setFilter("all"),
      });
    }
    if (categoryFilter !== "all") {
      const found = CATEGORY_OPTIONS.find((c) => c.key === categoryFilter);
      chips.push({
        key: "category",
        label: `Category: ${found?.label ?? categoryFilter}`,
        onRemove: () => setCategoryFilter("all"),
      });
    }
    if (sortBy !== "updated_desc") {
      chips.push({
        key: "sort",
        label: sortBy === "created_desc" ? "Sort: Newest First" : "Sort: Oldest First",
        onRemove: () => setSortBy("updated_desc"),
      });
    }
    if (query.trim()) {
      chips.push({
        key: "query",
        label: `Search: "${query.trim()}"`,
        onRemove: () => setQuery(""),
      });
    }
    return chips;
  }, [filter, categoryFilter, sortBy, query]);

  const activeFilterCount =
    (filter !== "all" ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (sortBy !== "updated_desc" ? 1 : 0) +
    (query.trim() ? 1 : 0);

  function resetAllFilters() {
    setFilter("all");
    setCategoryFilter("all");
    setSortBy("updated_desc");
    setQuery("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink font-display">
          My Complaints
        </h1>
        <p className="text-xs font-medium text-ink-soft mt-0.5">
          Track and monitor resolution progress on your submitted reports
        </p>
      </div>

      <ExpandableFilterBar
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen((prev) => !prev)}
        activeCount={activeFilterCount}
        chips={filterChips}
        onResetAll={resetAllFilters}
        panelTitle="Complaint Filters & Sorting"
        leading={
          <div className="relative flex-1 min-w-[220px]">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/70"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, address, or reference ID..."
              className="glass-input w-full rounded-xl py-2 pl-9 pr-3 text-xs font-medium text-ink placeholder:text-ink-soft/60 focus:outline-none"
              aria-label="Search complaints"
            />
          </div>
        }
        trailing={
          <span className="text-[11px] font-semibold text-ink-soft">
            {filtered.length} of {complaints.length} report{complaints.length === 1 ? "" : "s"}
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="my-complaints-status"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-soft"
            >
              Status
            </label>
            <select
              id="my-complaints-status"
              value={filter}
              onChange={(e) => setFilter(e.target.value as ComplaintStatus | "all")}
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-xs font-semibold text-ink focus:border-primary focus:outline-none cursor-pointer"
            >
              {FILTERS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="my-complaints-category"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-soft"
            >
              Category
            </label>
            <select
              id="my-complaints-category"
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as Complaint["category"] | "all")
              }
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-xs font-semibold text-ink focus:border-primary focus:outline-none cursor-pointer"
            >
              {CATEGORY_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="my-complaints-sort"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-soft"
            >
              Sort Order
            </label>
            <select
              id="my-complaints-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOrder)}
              className="w-full rounded-xl border border-slate-200/90 bg-white/85 px-3 py-2 text-xs font-semibold text-ink focus:border-primary focus:outline-none cursor-pointer"
            >
              <option value="updated_desc">Recently Updated</option>
              <option value="created_desc">Newest Submitted</option>
              <option value="created_asc">Oldest Submitted</option>
            </select>
          </div>
        </div>
      </ExpandableFilterBar>

      {loading ? (
        <div
          className="glass-panel rounded-ios-2xl px-6 py-16 text-center text-sm text-ink-soft"
          role="status"
        >
          Loading your complaints...
        </div>
      ) : error ? (
        <div
          className="glass-panel rounded-ios-2xl px-6 py-12 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold text-rose-700">
            Could not load your complaints
          </p>
          <p className="mt-2 text-xs text-ink-soft">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ios-btn-primary mt-4 px-4 py-2 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-ios-2xl border-dashed border-white/60 px-6 py-16 text-center flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/60 text-ink-soft border border-white/70 shadow-sm">
            <FileText size={28} />
          </div>

          <p className="text-base font-semibold text-ink">
            {complaints.length === 0
              ? "You haven't submitted any complaints yet"
              : "No complaints match your filters"}
          </p>

          <p className="text-xs text-ink-soft max-w-sm">
            {complaints.length === 0
              ? "When you report an issue, it will appear here so you can track its progress."
              : "Try adjusting your search criteria or selecting another status."}
          </p>

          {complaints.length === 0 && (
            <Link
              to="/report"
              className="ios-btn-primary mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white shadow-md"
            >
              <Plus size={14} weight="bold" />
              Report a new issue
            </Link>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((complaint) => (
            <li key={complaint.id}>
              <Link
                to={`/complaints/${complaint.id}`}
                className="glass-panel group relative block rounded-ios-2xl p-5 sm:p-6 border border-white/70 shadow-ios-glass transition-all duration-200 hover:shadow-ios-glass-hover hover:border-white active:scale-[0.995]"
              >
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-ink-soft/90 bg-white/60 border border-white/80 px-2.5 py-0.5 rounded-md backdrop-blur-sm shadow-xs">
                      #{referenceIds[complaint.id] ?? complaint.id}
                    </span>
                    <StatusBadge status={complaint.status} />
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-ink-soft shrink-0">
                    <Clock size={13} className="text-ink-soft/70" />
                    <span>
                      Updated{" "}
                      {new Date(complaint.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <h2 className="text-base sm:text-lg font-bold text-ink group-hover:text-primary transition-colors tracking-tight mb-3">
                  {complaint.title}
                </h2>

                <div className="flex items-center justify-between gap-4 pt-2.5 border-t border-white/40 text-xs text-ink-soft">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin size={15} className="text-primary shrink-0" />
                    <span className="truncate">
                      {complaint.location.address || "Address not available"}
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1 font-semibold text-primary shrink-0 group-hover:translate-x-0.5 transition-transform">
                    <span>View details</span>
                    <CaretRight size={13} weight="bold" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
