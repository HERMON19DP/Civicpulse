import type { ComplaintStatus, ComplaintPriority } from "../types/complaint";

const STATUS_CONFIG: Record<
  ComplaintStatus,
  { label: string; text: string; bg: string; border: string; glow: string }
> = {
  open: {
    label: "Open",
    text: "text-amber-800",
    bg: "bg-amber-400/20",
    border: "border-amber-400/35",
    glow: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
  },
  in_progress: {
    label: "In Progress",
    text: "text-blue-800",
    bg: "bg-blue-500/20",
    border: "border-blue-400/35",
    glow: "bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]",
  },
  resolved: {
    label: "Resolved",
    text: "text-emerald-800",
    bg: "bg-emerald-500/20",
    border: "border-emerald-400/35",
    glow: "bg-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  },
  rejected: {
    label: "Rejected",
    text: "text-rose-800",
    bg: "bg-rose-500/20",
    border: "border-rose-400/35",
    glow: "bg-rose-600 shadow-[0_0_8px_rgba(225,29,72,0.6)]",
  },
};

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md border ${cfg.bg} ${cfg.text} ${cfg.border} shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${cfg.glow}`}
        aria-hidden="true"
      />
      {cfg.label}
    </span>
  );
}

const PRIORITY_CONFIG: Record<
  ComplaintPriority,
  { label: string; text: string; bg: string; border: string }
> = {
  low: {
    label: "Low",
    text: "text-slate-600",
    bg: "bg-slate-500/10",
    border: "border-slate-300/60",
  },
  medium: {
    label: "Medium",
    text: "text-blue-700",
    bg: "bg-blue-500/15",
    border: "border-blue-300/60",
  },
  high: {
    label: "High",
    text: "text-amber-700",
    bg: "bg-amber-500/15",
    border: "border-amber-300/60",
  },
  urgent: {
    label: "Urgent",
    text: "text-rose-700",
    bg: "bg-rose-500/15",
    border: "border-rose-300/60",
  },
};

export function PriorityTag({ priority }: { priority: ComplaintPriority }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;

  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold backdrop-blur-md border ${cfg.bg} ${cfg.text} ${cfg.border} shadow-[inset_0_1px_0.5px_rgba(255,255,255,0.7)]`}
    >
      {cfg.label}
    </span>
  );
}
