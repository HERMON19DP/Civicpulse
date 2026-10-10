import { useEffect, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { ComplaintList } from "../components/ComplaintList";
import { api } from "../api/client";
import type {
  Complaint,
  ComplaintStatus,
  ComplaintCategory,
} from "../types/complaint";

const STATUS_FILTERS: {
  key: ComplaintStatus | "all";
  label: string;
}[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
];

const CATEGORY_FILTERS: {
  key: ComplaintCategory | "all";
  label: string;
}[] = [
  { key: "all", label: "All categories" },
  { key: "roads", label: "Roads" },
  { key: "water_supply", label: "Water Supply" },
  { key: "electricity", label: "Electricity" },
  { key: "sanitation", label: "Sanitation" },
  { key: "public_safety", label: "Public Safety" },
  { key: "other", label: "Other" },
];

export default function ComplaintQueue() {
  const [status, setStatus] = useState<ComplaintStatus | "all">("all");
  const [category, setCategory] = useState<ComplaintCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        setError(null);

        try {
          const results = await api.getQueue({
            status,
            category,
            query,
          });

          if (!cancelled) {
            setComplaints(results);
          }
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error ? err.message : "Unable to load complaints.",
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      },
      query.trim() ? 300 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [status, category, query]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
            Queue Management
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Complaint Queue
          </h1>
        </div>

        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/70 bg-white/50 px-3 py-1 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md sm:self-auto">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          {loading ? "Loading complaints…" : `${complaints.length} complaints`}
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full items-center rounded-2xl border border-white/70 bg-black/[0.04] p-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl sm:min-w-0">
          {STATUS_FILTERS.map((filter) => {
            const isActive = status === filter.key;

            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatus(filter.key)}
                className={`flex-1 whitespace-nowrap rounded-xl px-4 py-1.5 text-xs font-semibold transition-all duration-200 sm:flex-initial ${
                  isActive
                    ? "scale-[1.02] bg-white text-ink shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_1px_rgba(255,255,255,0.9)]"
                    : "text-ink-soft hover:bg-white/30 hover:text-ink"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass-panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={17}
            weight="bold"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft/70"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by reference ID, title, or description"
            className="glass-input w-full py-2.5 pl-10 pr-4 text-sm"
            aria-label="Search complaints"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as ComplaintCategory | "all")
            }
            className="glass-input px-3.5 py-2.5 text-sm font-medium"
            aria-label="Filter by category"
          >
            {CATEGORY_FILTERS.map((filter) => (
              <option key={filter.key} value={filter.key}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="glass-panel flex flex-col gap-3 border border-rose-500/30 p-4 text-sm text-rose-800"
        >
          <p className="font-semibold">Couldn't load the complaint queue.</p>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setLoading(true);
              api
                .getQueue({ status, category, query })
                .then(setComplaints)
                .catch((err: unknown) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Unable to load complaints.",
                  );
                })
                .finally(() => setLoading(false));
            }}
            className="self-start rounded-lg border border-white/70 bg-white/60 px-3 py-1.5 text-xs font-semibold text-ink"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div
          role="status"
          className="glass-panel px-6 py-14 text-center text-sm text-ink-soft"
        >
          Loading complaints from CivicPulse…
        </div>
      ) : !error ? (
        <ComplaintList complaints={complaints} />
      ) : null}
    </div>
  );
}
