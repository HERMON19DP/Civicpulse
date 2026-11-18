import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  Buildings,
  CheckCircle,
  Circle,
  Clock,
  FilePdf,
  VideoCamera,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { StatusBadge } from "../components/StatusBadge";
import { api, resolveAssetUrl, type CreatedComplaint } from "../api/client";
import type {
  Complaint,
  ComplaintStatus,
  TimelineEvent,
} from "../types/complaint";

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

function formatBackendStatusLabel(status?: string) {
  if (!status) return "Open";
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toComplaint(item: CreatedComplaint): Complaint {
  const timeline: TimelineEvent[] =
    Array.isArray(item.timeline) && item.timeline.length > 0
      ? item.timeline.map((event) => ({
          id: event.id,
          fromStatus: event.fromStatus ?? null,
          status: mapStatus(event.status),
          rawStatus: event.status,
          actor: event.actor || "System",
          actorRole: event.actorRole,
          note:
            event.note ||
            `Status updated to ${formatBackendStatusLabel(event.status)}`,
          timestamp: event.timestamp,
        }))
      : [
          {
            id: "submitted",
            status: mapStatus(item.status),
            rawStatus: item.status,
            actor: "You",
            note: "Complaint submitted",
            timestamp: item.createdAt,
          },
        ];

  return {
    id: item.id,
    referenceId: item.referenceId,
    title: item.title,
    description: item.description,
    category: mapCategory(item.category),
    department: item.department ?? null,
    assignedOfficer: item.assignedOfficer ?? null,
    status: mapStatus(item.status),
    priority: item.priority ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    location: {
      address: item.address ?? "",
      lat: Number(item.latitude),
      lng: Number(item.longitude),
    },
    evidence: Array.isArray(item.evidence)
      ? item.evidence.map((e) => ({
          id: e.id,
          url: resolveAssetUrl(e.url),
          type: e.type || "document",
          originalName: e.originalName,
          mimeType: e.mimeType,
          fileSize: e.fileSize,
          uploadedAt: e.uploadedAt,
        }))
      : [],
    timeline,
    intelligence: item.intelligence ?? null,
  };
}

export default function ComplaintDetails() {
  const { id } = useParams<{ id: string }>();

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [referenceId, setReferenceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadComplaint() {
      if (!id) {
        setError("Complaint ID is missing from the URL.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const result = await api.getComplaint(id);

        if (cancelled) return;

        setComplaint(toComplaint(result.data));
        setReferenceId(result.data.referenceId);
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load complaint details.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadComplaint();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to="/complaints"
        className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink border border-white/60 bg-white/40 shadow-sm backdrop-blur-md transition-all active:scale-95"
      >
        <ArrowLeft size={14} weight="bold" />
        Back to My Complaints
      </Link>

      {loading ? (
        <div
          className="glass-panel rounded-ios-2xl px-6 py-16 text-center text-sm text-ink-soft"
          role="status"
        >
          Loading complaint details...
        </div>
      ) : error ? (
        <div
          className="glass-panel rounded-ios-2xl p-6 text-center"
          role="alert"
        >
          <h1 className="text-lg font-bold text-ink">
            Could not load complaint
          </h1>
          <p className="mt-2 text-sm text-ink-soft">{error}</p>
          <Link
            to="/complaints"
            className="ios-btn-primary mt-4 inline-flex px-4 py-2 text-xs font-semibold text-white"
          >
            Back to My Complaints
          </Link>
        </div>
      ) : complaint ? (
        <>
          <div className="glass-panel rounded-ios-2xl p-6 sm:p-7 shadow-ios-glass border border-white/70">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <span className="font-mono text-xs font-bold text-ink-soft/80 bg-white/50 border border-white/70 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                #{referenceId || complaint.id}
              </span>
              <StatusBadge status={complaint.status} />
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink font-display mb-2">
              {complaint.title}
            </h1>

            <p className="text-sm text-ink-soft leading-relaxed mb-6 whitespace-pre-wrap">
              {complaint.description}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-white/40">
              <InfoTile
                icon={MapPin}
                label="Location"
                value={complaint.location.address || "Address not available"}
              />
              <InfoTile
                icon={Buildings}
                label="Department"
                value={complaint.department || "Municipal General Services"}
              />
            </div>

            <div className="mt-5 border-t border-white/40 pt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
                  Evidence ({complaint.evidence.length})
                </span>
              </div>

              {complaint.evidence.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {complaint.evidence.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex flex-col overflow-hidden rounded-xl border border-white/70 bg-white/55 shadow-sm transition hover:border-blue-400"
                    >
                      {item.type === "image" ? (
                        <img
                          src={item.url}
                          alt={item.originalName || "Uploaded evidence"}
                          className="h-28 w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : item.type === "video" ? (
                        <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-slate-100 text-primary">
                          <VideoCamera size={24} weight="duotone" />
                          <span className="text-[11px] font-semibold">Video</span>
                        </div>
                      ) : (
                        <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-slate-100 text-rose-600">
                          <FilePdf size={24} weight="duotone" />
                          <span className="text-[11px] font-semibold">Document</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft">
                        <span className="truncate">
                          {item.originalName || "Evidence"}
                        </span>
                        <ArrowSquareOut size={12} className="shrink-0 text-primary" />
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-ink-soft">
                  No evidence files were attached to this complaint.
                </p>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-ios-2xl p-6 sm:p-7 shadow-ios-glass border border-white/70">
            <div className="flex items-center justify-between gap-2 mb-5">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-primary" weight="duotone" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
                  Activity &amp; Resolution Timeline
                </h2>
              </div>
              <span className="text-xs font-semibold text-ink-soft">
                {complaint.timeline.length}{" "}
                {complaint.timeline.length === 1 ? "event" : "events"}
              </span>
            </div>

            <ol className="flex flex-col gap-6">
              {complaint.timeline.map((event, index) => {
                const isLast = index === complaint.timeline.length - 1;

                return (
                  <li key={event.id} className="relative flex gap-3.5">
                    {!isLast && (
                      <span
                        className="absolute left-[11px] top-6 h-full w-0.5 bg-gradient-to-b from-primary/50 to-blue-200"
                        aria-hidden="true"
                      />
                    )}

                    <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center">
                      {isLast ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 ring-4 ring-blue-100">
                          <Circle
                            size={10}
                            weight="fill"
                            className="text-white"
                          />
                        </div>
                      ) : (
                        <CheckCircle
                          size={22}
                          weight="fill"
                          className="shrink-0 text-emerald-500"
                        />
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-1 -mt-0.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink leading-tight">
                          {event.note}
                        </span>
                        {event.rawStatus && (
                          <span className="rounded-full border border-white/70 bg-white/60 px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                            {formatBackendStatusLabel(event.rawStatus)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                        <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/50">
                          {event.actor}
                        </span>
                        <span>&middot;</span>
                        <span>
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="mt-5 border-t border-white/40 pt-4 text-xs text-ink-soft">
              Timeline updates are persisted in CivicPulse and appear automatically
              as officers review, assign, and resolve your report.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-white/70 bg-white/50 p-3 shadow-xs">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-primary">
        <Icon size={16} weight="duotone" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-soft">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-ink">
          {value}
        </span>
      </div>
    </div>
  );
}
