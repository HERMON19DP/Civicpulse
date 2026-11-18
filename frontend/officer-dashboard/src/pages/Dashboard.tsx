import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  WarningCircle,
  ArrowRight,
  ArrowsClockwise,
  Heartbeat,
  Sparkle,
  Robot,
  CaretDown,
  Lightning,
  SignIn,
} from "@phosphor-icons/react";
import { ComplaintList } from "../components/ComplaintList";
import { api } from "../api/client";
import type {
  BackgroundJobsResponse,
  Complaint,
  CurrentUserProfile,
  DashboardStats,
  Layer1MetricsResponse,
} from "../types/complaint";
import type { HotspotListResponse } from "../types/spatial";
import type { InfrastructureOverviewResponse } from "../types/infrastructure";
import type { MorningDigestResponse } from "../types/copilot";

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getBriefTeaser(
  infra: InfrastructureOverviewResponse | null,
  hotspots: HotspotListResponse | null,
  stats: DashboardStats | null,
) {
  const criticalCount = infra?.summary?.gradeCounts?.CRITICAL ?? 0;
  const hotspotCount = hotspots?.total ?? 0;
  const overlapCount = hotspots?.crossCategoryOverlapCount ?? 0;
  const pendingCount = stats?.pending ?? 0;

  if (criticalCount > 0 || hotspotCount > 0 || overlapCount > 0) {
    const highlights: string[] = [];
    if (criticalCount > 0) {
      highlights.push(`${criticalCount} critical asset risk${criticalCount === 1 ? "" : "s"}`);
    }
    if (hotspotCount > 0) {
      highlights.push(`${hotspotCount} active hotspot${hotspotCount === 1 ? "" : "s"}`);
    }
    if (overlapCount > 0) {
      highlights.push(
        `${overlapCount} multi-department conflict${overlapCount === 1 ? "" : "s"}`,
      );
    }
    const listStr =
      highlights.length === 1
        ? highlights[0]
        : highlights.length === 2
          ? `${highlights[0]} and ${highlights[1]}`
          : `${highlights.slice(0, -1).join(", ")}, and ${highlights[highlights.length - 1]}`;
    return `Action required: ${listStr} flagged across your wards. Pull down to inspect AI recommendations, health telemetry, and queue pipeline.`;
  }

  if (pendingCount > 0) {
    return `${pendingCount} incoming complaint${pendingCount === 1 ? "" : "s"} enriched with AI triage briefs ready for review. Pull down to inspect pipeline telemetry and background jobs.`;
  }

  return "All municipal infrastructure networks are operating stably with full AI triage coverage. Pull down to view live health telemetry and background queue status.";
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentComplaints, setRecentComplaints] = useState<Complaint[]>([]);
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [jobsData, setJobsData] = useState<BackgroundJobsResponse | null>(null);
  const [layer1Metrics, setLayer1Metrics] = useState<Layer1MetricsResponse | null>(null);
  const [hotspotSummary, setHotspotSummary] = useState<HotspotListResponse | null>(null);
  const [infraOverview, setInfraOverview] =
    useState<InfrastructureOverviewResponse | null>(null);
  const [copilotDigest, setCopilotDigest] =
    useState<MorningDigestResponse | null>(null);
  const [runningJobs, setRunningJobs] = useState(false);
  const [jobsNotice, setJobsNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pull-down state & active drawer tab
  const [isBriefExpanded, setIsBriefExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"copilot" | "infra" | "queue">("copilot");

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const [
        statsRes,
        queueRes,
        profileRes,
        intelligenceJobsRes,
        metricsRes,
        hotspotsRes,
        infraRes,
        digestRes,
      ] = await Promise.all([
        api.getDashboardStats(),
        api.getQueue({ limit: 5 }),
        api.getProfile().catch(() => null),
        api.getIntelligenceJobs(5).catch(() => null),
        api.getIntelligenceMetrics().catch(() => null),
        api.getHotspots({ limit: 25 }).catch(() => null),
        api.getInfrastructureHealth({ limit: 12 }).catch(() => null),
        api.getCopilotDigest({ limit: 3 }).catch(() => null),
      ]);

      setStats(statsRes);
      setRecentComplaints(queueRes);
      if (profileRes?.data) {
        setProfile(profileRes.data);
      }
      setJobsData(intelligenceJobsRes);
      setLayer1Metrics(metricsRes);
      setHotspotSummary(hotspotsRes);
      setInfraOverview(infraRes);
      setCopilotDigest(digestRes);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load officer dashboard overview from backend.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function handleProcessQueue() {
    setRunningJobs(true);
    setJobsNotice(null);

    try {
      const result = await api.retryIntelligenceJobs();
      const totalProcessed = (result.backfill?.processed || 0) + (result.due?.processed || 0);
      const totalSucceeded = (result.backfill?.succeeded || 0) + (result.due?.succeeded || 0);

      setJobsNotice(
        totalProcessed > 0
          ? `Processed ${totalProcessed} background job${totalProcessed === 1 ? "" : "s"} (${totalSucceeded} succeeded).`
          : "All complaints are already enriched; no pending jobs in queue.",
      );

      const [statsRes, queueRes, updatedJobs, updatedMetrics, updatedHotspots] = await Promise.all([
        api.getDashboardStats(),
        api.getQueue({ limit: 5 }),
        api.getIntelligenceJobs(5).catch(() => null),
        api.getIntelligenceMetrics().catch(() => null),
        api.getHotspots({ limit: 25 }).catch(() => null),
      ]);
      setStats(statsRes);
      setRecentComplaints(queueRes);
      if (updatedJobs) setJobsData(updatedJobs);
      if (updatedMetrics) setLayer1Metrics(updatedMetrics);
      if (updatedHotspots) setHotspotSummary(updatedHotspots);
    } catch (err) {
      setJobsNotice(
        err instanceof Error ? err.message : "Failed to run background job sweep.",
      );
    } finally {
      setRunningJobs(false);
    }
  }

  const criticalAssetCount = infraOverview?.summary?.gradeCounts?.CRITICAL ?? 0;
  const hotspotCount = hotspotSummary?.total ?? 0;
  const overlapCount = hotspotSummary?.crossCategoryOverlapCount ?? 0;
  const teaserSentence = getBriefTeaser(infraOverview, hotspotSummary, stats);

  const isAuthError =
    error &&
    (error.toLowerCase().includes("token") ||
      error.toLowerCase().includes("unauthorized") ||
      error.toLowerCase().includes("expired"));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 pt-1 pb-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              Overview
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            {getTimeGreeting()}, {profile?.name || "Officer Console"}
          </h1>
          <p className="text-sm font-medium text-ink-soft">
            Live summary of civic complaints, queue metrics, and AI triage jobs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/70 bg-white/50 px-3.5 py-1.5 text-xs font-semibold text-ink-soft shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md transition-colors hover:bg-white/80 hover:text-ink disabled:opacity-50 cursor-pointer sm:self-auto"
        >
          <ArrowsClockwise size={14} className={loading ? "animate-spin text-primary" : ""} />
          Refresh
        </button>
      </div>

      {/* Error / Auth Notice */}
      {error && (
        <div
          role="alert"
          className="glass-panel flex flex-col gap-3 border border-rose-500/30 p-5 text-sm text-rose-800"
        >
          <div className="flex items-center gap-2 font-bold text-rose-900">
            <WarningCircle size={20} weight="fill" />
            {isAuthError ? "Session Expired" : "Unable to load dashboard metrics"}
          </div>
          <p className="text-xs text-rose-700">
            {isAuthError
              ? "Your officer session has expired or is invalid. Please sign in again to continue."
              : error}
          </p>
          <div className="flex items-center gap-2">
            {isAuthError ? (
              <Link
                to="/officer/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-strong cursor-pointer"
              >
                <SignIn size={14} weight="bold" />
                Sign in to Officer Console
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="self-start rounded-lg border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-white cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modern Pull-Down Civic Intelligence Brief (Consolidated & Streamlined) */}
      {!loading && !error && (
        <div className="glass-panel overflow-hidden border border-indigo-200/60 shadow-ios-glass transition-all duration-300">
          {/* Teaser Header & Pull-Down Trigger */}
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-primary to-blue-600 text-white shadow-md">
                  <Sparkle size={20} weight="fill" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200/80 bg-indigo-50/70 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                      <Robot size={12} weight="bold" />
                      Civic Intelligence Brief
                    </span>
                    {criticalAssetCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/80 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
                        {criticalAssetCount} Critical Risks
                      </span>
                    )}
                    {hotspotCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200/80 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                        {hotspotCount} Hotspots
                      </span>
                    )}
                    {overlapCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        {overlapCount} Overlaps
                      </span>
                    )}
                  </div>
                  {/* Action-Driving Teaser Sentence */}
                  <p className="text-sm font-semibold text-ink leading-snug">
                    {teaserSentence}
                  </p>
                </div>
              </div>

              {/* Pull-down Toggle Button */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsBriefExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-200/80 bg-white/80 px-4 py-2 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-white hover:text-indigo-900 cursor-pointer"
                >
                  <span>{isBriefExpanded ? "Collapse Brief" : "Pull Down Intelligence Brief"}</span>
                  <CaretDown
                    size={14}
                    weight="bold"
                    className={`transition-transform duration-200 ${
                      isBriefExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Pull-Down Drawer Content (Organized by 3 Clean Tabs) */}
          <AnimatePresence>
            {isBriefExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="border-t border-indigo-100 bg-white/40 p-4 sm:p-5"
              >
                {/* Clean Tab Controls */}
                <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-indigo-100/80 pb-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("copilot")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                      activeTab === "copilot"
                        ? "bg-primary text-white shadow-sm"
                        : "bg-white/60 text-ink-soft hover:bg-white hover:text-ink"
                    }`}
                  >
                    <Robot size={15} weight="bold" />
                    Officer Copilot
                    {copilotDigest?.priorityItems && copilotDigest.priorityItems.length > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                          activeTab === "copilot"
                            ? "bg-white/20 text-white"
                            : "bg-indigo-100 text-indigo-800"
                        }`}
                      >
                        {copilotDigest.priorityItems.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("infra")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                      activeTab === "infra"
                        ? "bg-primary text-white shadow-sm"
                        : "bg-white/60 text-ink-soft hover:bg-white hover:text-ink"
                    }`}
                  >
                    <Heartbeat size={15} weight="bold" />
                    Infrastructure Health
                    {criticalAssetCount > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                          activeTab === "infra"
                            ? "bg-white/20 text-white"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {criticalAssetCount} Critical
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("queue")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                      activeTab === "queue"
                        ? "bg-primary text-white shadow-sm"
                        : "bg-white/60 text-ink-soft hover:bg-white hover:text-ink"
                    }`}
                  >
                    <Lightning size={15} weight="bold" />
                    AI Queue & Telemetry
                    {jobsData?.stats && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                          activeTab === "queue"
                            ? "bg-white/20 text-white"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {jobsData.stats.completed} Done
                      </span>
                    )}
                  </button>
                </div>

                {/* Tab 1: Officer Copilot Digest */}
                {activeTab === "copilot" && copilotDigest && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-ink-soft">
                        {copilotDigest.digestSummary}
                      </p>
                      <Link
                        to="/officer/copilot"
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      >
                        Open Officer Copilot <ArrowRight size={12} weight="bold" />
                      </Link>
                    </div>

                    {copilotDigest.priorityItems.length > 0 ? (
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        {copilotDigest.priorityItems.slice(0, 3).map((item) => (
                          <Link
                            key={item.assetId}
                            to={`/officer/copilot?assetCode=${encodeURIComponent(
                              item.assetCode,
                            )}&q=${encodeURIComponent(item.suggestedPrompt)}`}
                            className="flex flex-col justify-between gap-1.5 rounded-xl border border-white/80 bg-white/80 p-3 shadow-xs transition hover:border-indigo-300 hover:bg-white"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] font-extrabold text-primary">
                                #{item.rank} · {item.assetCode}
                              </span>
                              <span className="font-mono text-xs font-extrabold text-rose-700">
                                {item.healthScore}/100
                              </span>
                            </div>
                            <p className="truncate text-xs font-bold text-ink">{item.name}</p>
                            <p className="line-clamp-2 text-[11px] text-ink-soft">
                              {item.whyItNeedsAttention}
                            </p>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-soft italic">
                        No critical priority items pending in this morning's Copilot digest.
                      </p>
                    )}
                  </div>
                )}

                {/* Tab 2: Infrastructure Health */}
                {activeTab === "infra" && infraOverview && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-ink-soft">
                        <span>
                          Network avg:{" "}
                          <strong className="font-mono text-ink">
                            {infraOverview.summary.avgHealthScore ?? "—"}/100
                          </strong>
                        </span>
                        <span>·</span>
                        <span>{infraOverview.summary.gradeCounts.CRITICAL} critical</span>
                        <span>·</span>
                        <span>{infraOverview.summary.gradeCounts.POOR} poor</span>
                        <span>·</span>
                        <span>
                          {infraOverview.summary.maintenanceOverdueCount} overdue maintenance
                        </span>
                      </div>
                      <Link
                        to="/officer/infrastructure-health"
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      >
                        Open Health Monitor <ArrowRight size={12} weight="bold" />
                      </Link>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-3">
                      {infraOverview.assets.slice(0, 3).map((asset) => {
                        const badgeCls =
                          asset.healthGrade === "CRITICAL"
                            ? "border-rose-300 bg-rose-500/15 text-rose-800"
                            : asset.healthGrade === "POOR"
                              ? "border-amber-300 bg-amber-500/15 text-amber-900"
                              : asset.healthGrade === "FAIR"
                                ? "border-sky-300 bg-sky-500/15 text-sky-900"
                                : "border-emerald-300 bg-emerald-500/15 text-emerald-800";

                        return (
                          <Link
                            key={asset.id}
                            to={`/officer/infrastructure-health?assetId=${encodeURIComponent(
                              asset.id,
                            )}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/80 p-3 shadow-xs transition hover:border-blue-300 hover:bg-white"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] font-extrabold text-primary">
                                  {asset.assetCode}
                                </span>
                                <span
                                  className={`rounded-full border px-1.5 py-0.2 text-[9px] font-extrabold ${badgeCls}`}
                                >
                                  {asset.healthGrade}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-xs font-bold text-ink">
                                {asset.name}
                              </p>
                              <p className="truncate text-[10px] text-ink-soft">
                                {[asset.ward, asset.city].filter(Boolean).join(" · ")}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <span className="font-mono text-lg font-extrabold text-ink">
                                {asset.healthScore}
                              </span>
                              <span className="block text-[9px] font-semibold uppercase text-ink-soft">
                                / 100
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tab 3: AI Background Queue & Telemetry */}
                {activeTab === "queue" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {jobsData && (
                          <>
                            <span className="rounded-full border border-emerald-300/60 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                              {jobsData.stats.completed} Completed
                            </span>
                            <span className="rounded-full border border-amber-300/60 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                              {jobsData.stats.pending +
                                jobsData.stats.processing +
                                jobsData.stats.retry_scheduled}{" "}
                              Pending
                            </span>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleProcessQueue()}
                        disabled={runningJobs}
                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-white px-3 py-1 text-xs font-semibold text-indigo-700 shadow-xs transition hover:bg-indigo-50 disabled:opacity-60 cursor-pointer"
                      >
                        <ArrowsClockwise size={13} className={runningJobs ? "animate-spin" : ""} />
                        {runningJobs ? "Processing…" : "Process Queue"}
                      </button>
                    </div>

                    {jobsNotice && (
                      <p className="rounded-xl border border-indigo-200/60 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-900">
                        {jobsNotice}
                      </p>
                    )}

                    {(layer1Metrics || hotspotSummary) && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-ink-soft">
                            Semantic Coverage
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-extrabold text-indigo-700">
                            {layer1Metrics ? `${layer1Metrics.embeddings.coveragePercent}%` : "—"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-ink-soft">
                            Avg AI Confidence
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-extrabold text-ink">
                            {layer1Metrics?.classification.avgConfidence != null
                              ? `${Math.round(layer1Metrics.classification.avgConfidence * 100)}%`
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-ink-soft">
                            Triage Latency
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-extrabold text-ink">
                            {layer1Metrics?.classification.avgInferenceLatencyMs != null
                              ? `${layer1Metrics.classification.avgInferenceLatencyMs} ms`
                              : "—"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-ink-soft">
                            Feedback Accept
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-extrabold text-emerald-700">
                            {layer1Metrics?.feedback.acceptanceRatePercent != null
                              ? `${layer1Metrics.feedback.acceptanceRatePercent}%`
                              : "100%"}
                          </p>
                        </div>
                      </div>
                    )}

                    {jobsData && jobsData.jobs.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {jobsData.jobs.slice(0, 3).map((job) => (
                          <Link
                            key={job.id}
                            to={`/officer/complaints/${job.complaintId}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/70 bg-white/60 px-2.5 py-1 text-[11px] transition hover:bg-white"
                          >
                            <span className="font-mono font-bold text-primary">
                              #{job.referenceId || job.complaintId.slice(0, 8)}
                            </span>
                            <span className="max-w-[140px] truncate font-medium text-ink">
                              {job.complaintTitle || job.jobType}
                            </span>
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                                job.status === "COMPLETED"
                                  ? "bg-emerald-500/15 text-emerald-700"
                                  : job.status === "FAILED"
                                    ? "bg-rose-500/15 text-rose-700"
                                    : "bg-amber-500/15 text-amber-700"
                              }`}
                            >
                              {job.status}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="glass-panel flex min-h-[100px] animate-pulse items-center justify-center p-6">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <ArrowsClockwise size={18} className="animate-spin text-primary" />
            Loading officer overview…
          </div>
        </div>
      )}

      {/* Recent Complaints Section */}
      {!error && (
        <div>
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Recent Complaints
              </h2>
            </div>
            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-block"
            >
              <Link
                to="/officer/complaints"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/50 px-3 py-1 text-xs font-semibold text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] backdrop-blur-md transition-colors hover:bg-white/80"
              >
                View full queue <ArrowRight size={13} weight="bold" />
              </Link>
            </motion.div>
          </div>

          {loading ? (
            <div
              role="status"
              className="glass-panel flex items-center justify-center gap-2.5 px-6 py-12 text-sm text-ink-soft"
            >
              <ArrowsClockwise size={18} className="animate-spin text-primary" />
              Loading recent complaints from backend…
            </div>
          ) : (
            <ComplaintList complaints={recentComplaints} />
          )}
        </div>
      )}
    </div>
  );
}
