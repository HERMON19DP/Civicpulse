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
import { api, type CreatedComplaint } from "../api/client";
import type { Complaint, ComplaintStatus } from "../types/complaint";

const FILTERS: { key: ComplaintStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
];

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

    return complaints.filter((complaint) => {
      const matchesFilter = filter === "all" || complaint.status === filter;

      const referenceId = referenceIds[complaint.id] ?? complaint.id;

      const matchesQuery =
        complaint.title.toLowerCase().includes(search) ||
        referenceId.toLowerCase().includes(search);

      return matchesFilter && matchesQuery;
    });
  }, [complaints, filter, query, referenceIds]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink font-display">
            My Complaints
          </h1>
          <p className="text-xs font-medium text-ink-soft mt-0.5">
            Track and monitor resolution progress on your submitted reports
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft/70"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or reference ID"
            className="glass-input w-full rounded-ios-xl py-2 pl-9 pr-4 text-xs font-medium text-ink placeholder:text-ink-soft/60 focus:outline-none"
            aria-label="Search complaints"
          />
        </div>
      </div>

      <div
        className="glass-pill inline-flex flex-wrap items-center gap-1 rounded-full p-1 border border-white/60 bg-white/40 shadow-sm backdrop-blur-md"
        role="tablist"
        aria-label="Filter by status"
      >
        {FILTERS.map((item) => {
          const active = filter === item.key;

          return (
            <button
              key={item.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                active
                  ? "bg-primary text-white shadow-[0_2px_8px_rgba(37,99,235,0.35),inset_0_1px_0.5px_rgba(255,255,255,0.4)]"
                  : "text-ink-soft hover:text-ink hover:bg-white/40"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

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
