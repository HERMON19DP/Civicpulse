import { Link } from "react-router-dom";
import { MapPin } from "@phosphor-icons/react";
import { StatusBadge, PriorityTag } from "./StatusBadge";
import type { Complaint } from "../types/complaint";

export function ComplaintList({ complaints }: { complaints: Complaint[] }) {
  if (complaints.length === 0) {
    return (
      <div className="glass-panel flex flex-col items-center gap-2 border-dashed px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100/80 text-ink-soft shadow-inner">
          <MapPin size={22} weight="duotone" />
        </div>
        <p className="text-sm font-semibold text-ink">
          No complaints match these filters
        </p>
        <p className="text-xs text-ink-soft">
          Try widening your search or clearing filters.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/60 bg-white/40 text-[11px] font-semibold uppercase tracking-wider text-ink-soft/90 backdrop-blur-md">
              <th className="px-5 py-3.5">ID</th>
              <th className="px-5 py-3.5">Title</th>
              <th className="px-5 py-3.5">Location</th>
              <th className="px-5 py-3.5">Priority</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/40">
            {complaints.map((c) => (
              <tr
                key={c.id}
                className="group transition-colors duration-150 hover:bg-white/50"
              >
                <td className="px-5 py-3.5">
                  <Link
                    to={`/officer/complaints/${c.id}`}
                    className="inline-flex items-center rounded-md bg-primary-soft/50 px-2 py-0.5 font-mono text-xs font-semibold text-primary transition-all group-hover:bg-primary-soft"
                  >
                    #{c.referenceId ?? c.id}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <Link
                    to={`/officer/complaints/${c.id}`}
                    className="font-medium text-ink transition-colors hover:text-blue-600"
                  >
                    {c.title}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-ink-soft">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <MapPin
                      size={14}
                      className="shrink-0 text-primary/70"
                      weight="fill"
                    />{" "}
                    {c.location.address || "Address not provided"}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <PriorityTag priority={c.priority} />
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-5 py-3.5 text-xs text-ink-soft font-mono">
                  {new Date(c.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
