import type {
  AiFeedbackPayload,
  AssignedOfficerInfo,
  BackgroundJobsResponse,
  Complaint,
  ComplaintIntelligence,
  CurrentUserProfile,
  DashboardStats,
  EvidenceFile,
  Layer1MetricsResponse,
  OfficerDirectoryUser,
  SemanticSearchResponse,
  SimilarComplaintsResponse,
  TimelineEvent,
} from "../types/complaint";
import type {
  ActiveCitiesResponse,
  GeocodeResponse,
  HotspotDetectResponse,
  HotspotListResponse,
  SpatialAnalysisRequest,
  SpatialAnalysisResult,
  WardAnalyticsResponse,
} from "../types/spatial";
import type {
  AssetDetailsResponse,
  CreateAssetPayload,
  InfrastructureAsset,
  InfrastructureMetricsResponse,
  InfrastructureOverviewResponse,
  LogMaintenancePayload,
  MaintenanceEvent,
  WardHealthResponse,
} from "../types/infrastructure";
import type {
  AssetInvestigationResponse,
  ComplaintInvestigationResponse,
  GraphMetricsResponse,
  GraphOverviewResponse,
  NodeNeighborhoodResponse,
  RebuildGraphResponse,
  ShortestPathResponse,
} from "../types/graph";
import type {
  AskCopilotResponse,
  CopilotMessage,
  CopilotMetricsResponse,
  CopilotRecommendation,
  CopilotSession,
  MorningDigestResponse,
  RecommendationDecisionStatus,
} from "../types/copilot";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";
const API_ORIGIN = BASE_URL.replace(/\/api\/v1\/?$/, "");

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

interface RawEvidencePayload {
  id: string;
  url: string;
  type: "image" | "video" | "document";
  originalName?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt: string;
}

interface RawTimelinePayload {
  id: string;
  fromStatus?: string | null;
  status: string;
  actor: string;
  actorRole?: string;
  note?: string;
  timestamp: string;
}

interface RawComplaintPayload {
  id: string;
  referenceId?: string;
  title: string;
  description: string;
  category: string;
  department?: string | null;
  assignedOfficer?: AssignedOfficerInfo | null;
  address: string;
  city?: string | null;
  ward?: string | null;
  zone?: string | null;
  status: string;
  priority?: string | null;
  latitude: number | null;
  longitude: number | null;
  possibleDuplicateOfId?: string | null;
  evidence?: RawEvidencePayload[];
  timeline?: RawTimelinePayload[];
  intelligence?: ComplaintIntelligence | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrichComplaintResponse {
  complaintId: string;
  aiCategory: string | null;
  aiPriority: string | null;
  aiSummary: string | null;
  aiConfidence: number | null;
  aiTags: string[];
  aiMetadata: ComplaintIntelligence["aiMetadata"];
  priority: string | null;
  department: string | null;
  enrichmentStatus: string;
  enrichedAt: string | null;
  embedding?: {
    status: string;
    reason?: string;
  } | null;
}

export function resolveAssetUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("cp_officer_token");
  const isFormData = options?.body instanceof FormData;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) {
      localStorage.removeItem("cp_officer_token");
      if (window.location.pathname !== "/officer/login") {
        window.location.replace("/officer/login");
      }
    }
    throw new Error(
      body.error?.message ?? body.message ?? `Request failed: ${res.status}`,
    );
  }

  return body;
}

function normalizePriority(raw?: string | null): Complaint["priority"] {
  if (!raw) return "medium";
  const lower = raw.toLowerCase().trim();
  if (["low", "medium", "high", "urgent", "critical"].includes(lower)) {
    return lower as Complaint["priority"];
  }
  return "medium";
}

function mapEvidence(items?: RawEvidencePayload[]): EvidenceFile[] {
  if (!Array.isArray(items)) return [];

  return items.map((e) => ({
    id: e.id,
    url: resolveAssetUrl(e.url),
    type: e.type || "document",
    originalName: e.originalName,
    mimeType: e.mimeType,
    fileSize: e.fileSize,
    uploadedAt: e.uploadedAt,
  }));
}

function mapTimeline(
  item: RawComplaintPayload,
  includeFallbackTimeline: boolean,
): TimelineEvent[] {
  if (Array.isArray(item.timeline) && item.timeline.length > 0) {
    return item.timeline.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus ?? null,
      status: event.status,
      actor: event.actor || "System",
      actorRole: event.actorRole,
      note: event.note || `Status transitioned to ${event.status}`,
      timestamp: event.timestamp,
    }));
  }

  if (!includeFallbackTimeline) {
    return [];
  }

  return [
    {
      id: "t-init",
      status: item.status,
      actor: "System",
      note: "Civic complaint logged into system",
      timestamp: item.createdAt,
    },
    ...(item.updatedAt !== item.createdAt
      ? [
          {
            id: "t-latest",
            status: item.status,
            actor: "Officer / System",
            note: `Status synchronized as ${item.status}`,
            timestamp: item.updatedAt,
          },
        ]
      : []),
  ];
}

function mapComplaint(item: RawComplaintPayload, includeTimeline = false): Complaint {
  return {
    id: item.id,
    referenceId: item.referenceId,
    title: item.title,
    description: item.description,
    category: item.category as Complaint["category"],
    department: item.department ?? null,
    assignedOfficer: item.assignedOfficer ?? null,
    status: item.status,
    priority: normalizePriority(item.priority),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    location: {
      address: item.address || "Address not provided",
      city: item.city ?? null,
      ward: item.ward || item.department || "Jurisdiction Ward",
      zone: item.zone ?? null,
      lat: item.latitude ?? 0,
      lng: item.longitude ?? 0,
    },
    possibleDuplicateOfId: item.possibleDuplicateOfId ?? null,
    evidence: mapEvidence(item.evidence),
    timeline: mapTimeline(item, includeTimeline),
    intelligence: item.intelligence ?? null,
  };
}

export const api = {
  login: (email: string, password: string) =>
    request<{ data: LoginResponse }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getProfile: () => request<{ data: CurrentUserProfile }>("/users/me"),

  getOfficers: async (): Promise<OfficerDirectoryUser[]> => {
    const response = await request<{ data: OfficerDirectoryUser[] }>("/users/officers");
    return response.data;
  },

  getQueue: async (params?: {
    status?: string;
    category?: string;
    city?: string;
    query?: string;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();

    if (params?.status && params.status !== "all") {
      searchParams.set("status", params.status);
    }

    if (params?.category && params.category !== "all") {
      searchParams.set("category", params.category);
    }

    if (params?.city && params.city !== "all") {
      searchParams.set("city", params.city);
    }

    if (params?.query?.trim()) {
      searchParams.set("query", params.query.trim());
    }

    if (params?.limit !== undefined && params.limit > 0) {
      searchParams.set("limit", String(params.limit));
    }

    const qs = searchParams.toString();
    const response = await request<{
      data: RawComplaintPayload[];
    }>(`/complaints${qs ? `?${qs}` : ""}`);

    return response.data.map((item) => mapComplaint(item));
  },

  getComplaint: async (id: string): Promise<Complaint> => {
    const response = await request<{
      data: RawComplaintPayload;
    }>(`/complaints/${encodeURIComponent(id)}`);

    return mapComplaint(response.data, true);
  },

  updateStatus: async (
    id: string,
    status: string,
    note?: string,
    assignedOfficerId?: string | null,
    possibleDuplicateOfId?: string | null,
  ): Promise<Complaint> => {
    const payload: {
      status: string;
      note?: string;
      assignedOfficerId?: string | null;
      possibleDuplicateOfId?: string | null;
    } = { status };

    if (note && note.trim()) {
      payload.note = note.trim();
    }
    if (assignedOfficerId !== undefined) {
      payload.assignedOfficerId = assignedOfficerId;
    }
    if (possibleDuplicateOfId !== undefined) {
      payload.possibleDuplicateOfId = possibleDuplicateOfId;
    }

    const response = await request<{ data: RawComplaintPayload }>(
      `/complaints/${encodeURIComponent(id)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
    return mapComplaint(response.data, true);
  },

  assignOfficer: async (
    id: string,
    assignedOfficerId: string | null,
    note?: string,
  ): Promise<Complaint> => {
    const response = await request<{ data: RawComplaintPayload }>(
      `/complaints/${encodeURIComponent(id)}/assign`,
      {
        method: "PATCH",
        body: JSON.stringify({
          assignedOfficerId,
          ...(note && note.trim() ? { note: note.trim() } : {}),
        }),
      },
    );
    return mapComplaint(response.data, true);
  },

  uploadEvidence: async (
    complaintId: string,
    files: File[],
  ): Promise<EvidenceFile[]> => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    const response = await request<{ data: RawEvidencePayload[] }>(
      `/complaints/${encodeURIComponent(complaintId)}/evidence`,
      {
        method: "POST",
        body: formData,
      },
    );

    return mapEvidence(response.data);
  },

  deleteEvidence: (complaintId: string, evidenceId: string) =>
    request<{ data: { id: string; deleted: boolean } }>(
      `/complaints/${encodeURIComponent(complaintId)}/evidence/${encodeURIComponent(evidenceId)}`,
      { method: "DELETE" },
    ),

  getDashboardStats: async (): Promise<DashboardStats> => {
    const response = await request<{ data: DashboardStats }>("/complaints/stats");
    return response.data;
  },

  getMapComplaints: async (params?: {
    status?: string;
    category?: string;
    city?: string;
  }): Promise<Complaint[]> => {
    const searchParams = new URLSearchParams();

    if (params?.status && params.status !== "all") {
      searchParams.set("status", params.status);
    }

    if (params?.category && params.category !== "all") {
      searchParams.set("category", params.category);
    }

    if (params?.city && params.city !== "all") {
      searchParams.set("city", params.city);
    }

    const qs = searchParams.toString();
    const response = await request<{ data: RawComplaintPayload[] }>(
      `/complaints/map${qs ? `?${qs}` : ""}`,
    );

    return response.data.map((item) => mapComplaint(item));
  },

  enrichComplaint: async (id: string): Promise<EnrichComplaintResponse> => {
    const response = await request<{ data: EnrichComplaintResponse }>(
      `/intelligence/complaints/${encodeURIComponent(id)}/enrich`,
      { method: "POST" },
    );
    return response.data;
  },

  getIntelligenceJobs: async (limit = 10): Promise<BackgroundJobsResponse> => {
    const response = await request<{ data: BackgroundJobsResponse }>(
      `/intelligence/jobs?limit=${encodeURIComponent(limit)}`,
    );
    return response.data;
  },

  retryIntelligenceJobs: async (): Promise<{
    backfill: { enqueued: number; processed: number; succeeded: number; failed: number };
    due: { processed: number; succeeded: number; failed: number };
  }> => {
    const response = await request<{
      data: {
        backfill: { enqueued: number; processed: number; succeeded: number; failed: number };
        due: { processed: number; succeeded: number; failed: number };
      };
    }>("/intelligence/jobs/retry", { method: "POST" });
    return response.data;
  },

  analyzeSpatialArea: (payload: SpatialAnalysisRequest) =>
    request<{ success: boolean; data: SpatialAnalysisResult }>(
      "/spatial/analyze",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  getHotspots: async (params?: {
    city?: string;
    ward?: string;
    overlapOnly?: boolean;
    limit?: number;
  }): Promise<HotspotListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.city && params.city !== "all") searchParams.set("city", params.city);
    if (params?.ward) searchParams.set("ward", params.ward);
    if (params?.overlapOnly) searchParams.set("overlapOnly", "true");
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    const response = await request<{ success: boolean; data: HotspotListResponse }>(
      `/spatial/hotspots${qs ? `?${qs}` : ""}`,
    );
    return response.data;
  },

  detectHotspots: async (payload?: {
    clusterDistanceMeters?: number;
    minClusterSize?: number;
    timeWindowDays?: number | null;
    city?: string;
    ward?: string;
    category?: string;
    cityWide?: boolean;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
  }): Promise<HotspotDetectResponse> => {
    const response = await request<{ success: boolean; data: HotspotDetectResponse }>(
      "/spatial/hotspots/detect",
      {
        method: "POST",
        body: JSON.stringify(payload || { cityWide: true }),
      },
    );
    return response.data;
  },

  getWardAnalytics: async (params?: {
    city?: string;
    timeWindowDays?: number;
    category?: string;
  }): Promise<WardAnalyticsResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.city && params.city !== "all") {
      searchParams.set("city", params.city);
    }
    if (params?.timeWindowDays) {
      searchParams.set("timeWindowDays", String(params.timeWindowDays));
    }
    if (params?.category && params.category !== "all") {
      searchParams.set("category", params.category);
    }
    const qs = searchParams.toString();
    const response = await request<{ success: boolean; data: WardAnalyticsResponse }>(
      `/spatial/wards${qs ? `?${qs}` : ""}`,
    );
    return response.data;
  },

  getSpatialCities: async (): Promise<ActiveCitiesResponse> => {
    const response = await request<{ success: boolean; data: ActiveCitiesResponse }>(
      "/spatial/cities",
    );
    return response.data;
  },

  geocodePlace: async (query: string): Promise<GeocodeResponse> => {
    const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const response = await request<{ success: boolean; data: GeocodeResponse }>(
      `/spatial/geocode${qs}`,
    );
    return response.data;
  },

  semanticSearchComplaints: async (payload: {
    query: string;
    city?: string;
    category?: string;
    status?: string;
    limit?: number;
  }): Promise<SemanticSearchResponse> => {
    const response = await request<{ data: SemanticSearchResponse }>(
      "/intelligence/search",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return response.data;
  },

  getSimilarComplaintsAndHotspots: async (
    complaintId: string,
    limit = 6,
  ): Promise<SimilarComplaintsResponse> => {
    const response = await request<{ data: SimilarComplaintsResponse }>(
      `/intelligence/complaints/${encodeURIComponent(complaintId)}/similar?limit=${encodeURIComponent(limit)}`,
    );
    return response.data;
  },

  getIntelligenceMetrics: async (): Promise<Layer1MetricsResponse> => {
    const response = await request<{ data: Layer1MetricsResponse }>(
      "/intelligence/metrics",
    );
    return response.data;
  },

  submitAiFeedback: async (payload: AiFeedbackPayload) => {
    return request<{ data: unknown }>("/intelligence/feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getInfrastructureHealth: async (params?: {
    city?: string;
    ward?: string;
    assetType?: string;
    grade?: string;
    sortBy?: string;
    limit?: number;
  }): Promise<InfrastructureOverviewResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.city && params.city !== "all") searchParams.set("city", params.city);
    if (params?.ward && params.ward !== "all") searchParams.set("ward", params.ward);
    if (params?.assetType && params.assetType !== "all") {
      searchParams.set("assetType", params.assetType);
    }
    if (params?.grade && params.grade !== "all") searchParams.set("grade", params.grade);
    if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
    if (params?.limit) searchParams.set("limit", String(params.limit));

    const qs = searchParams.toString();
    const response = await request<{
      success: boolean;
      data: InfrastructureOverviewResponse;
    }>(`/intelligence/infrastructure/health${qs ? `?${qs}` : ""}`);
    return response.data;
  },

  getWardHealth: async (city?: string): Promise<WardHealthResponse> => {
    const qs = city && city !== "all" ? `?city=${encodeURIComponent(city)}` : "";
    const response = await request<{ success: boolean; data: WardHealthResponse }>(
      `/intelligence/infrastructure/wards${qs}`,
    );
    return response.data;
  },

  getInfrastructureAsset: async (id: string): Promise<AssetDetailsResponse> => {
    const response = await request<{ success: boolean; data: AssetDetailsResponse }>(
      `/intelligence/infrastructure/assets/${encodeURIComponent(id)}`,
    );
    return response.data;
  },

  createInfrastructureAsset: async (
    payload: CreateAssetPayload,
  ): Promise<AssetDetailsResponse> => {
    const response = await request<{ success: boolean; data: AssetDetailsResponse }>(
      "/intelligence/infrastructure/assets",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return response.data;
  },

  logAssetMaintenance: async (
    assetId: string,
    payload: LogMaintenancePayload,
  ): Promise<AssetDetailsResponse & { event: MaintenanceEvent }> => {
    const response = await request<{
      success: boolean;
      data: AssetDetailsResponse & { event: MaintenanceEvent };
    }>(`/intelligence/infrastructure/assets/${encodeURIComponent(assetId)}/maintenance`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response.data;
  },

  recomputeInfrastructureHealth: async (city?: string): Promise<{
    recomputedCount: number;
    city: string | null;
    assets: InfrastructureAsset[];
  }> => {
    const response = await request<{
      success: boolean;
      data: {
        recomputedCount: number;
        city: string | null;
        assets: InfrastructureAsset[];
      };
    }>("/intelligence/infrastructure/recompute", {
      method: "POST",
      body: JSON.stringify(city && city !== "all" ? { city } : {}),
    });
    return response.data;
  },

  getComplaintAssets: async (complaintId: string): Promise<{
    complaintId: string;
    assets: InfrastructureAsset[];
  }> => {
    const response = await request<{
      success: boolean;
      data: { complaintId: string; assets: InfrastructureAsset[] };
    }>(`/intelligence/infrastructure/complaints/${encodeURIComponent(complaintId)}`);
    return response.data;
  },

  getInfrastructureMetrics: async (
    city?: string,
  ): Promise<InfrastructureMetricsResponse> => {
    const qs = city && city !== "all" ? `?city=${encodeURIComponent(city)}` : "";
    const response = await request<{
      success: boolean;
      data: InfrastructureMetricsResponse;
    }>(`/intelligence/infrastructure/metrics${qs}`);
    return response.data;
  },

  getGraphOverview: async (params?: {
    city?: string;
    entityType?: string;
    q?: string;
    limit?: number;
  }): Promise<GraphOverviewResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.city && params.city !== "all") searchParams.set("city", params.city);
    if (params?.entityType && params.entityType !== "all") {
      searchParams.set("entityType", params.entityType);
    }
    if (params?.q?.trim()) searchParams.set("q", params.q.trim());
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    const response = await request<{ success: boolean; data: GraphOverviewResponse }>(
      `/intelligence/graph/overview${qs ? `?${qs}` : ""}`,
    );
    return response.data;
  },

  getGraphNodeNeighborhood: async (
    nodeKey: string,
    params?: { depth?: number; maxNodes?: number; includeInferred?: boolean },
  ): Promise<NodeNeighborhoodResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.depth) searchParams.set("depth", String(params.depth));
    if (params?.maxNodes) searchParams.set("maxNodes", String(params.maxNodes));
    if (params?.includeInferred !== undefined) {
      searchParams.set("includeInferred", String(params.includeInferred));
    }
    const qs = searchParams.toString();
    const response = await request<{
      success: boolean;
      data: NodeNeighborhoodResponse;
    }>(`/intelligence/graph/nodes/${encodeURIComponent(nodeKey)}${qs ? `?${qs}` : ""}`);
    return response.data;
  },

  investigateGraphAsset: async (
    assetIdOrCode: string,
    params?: { includeInferred?: boolean },
  ): Promise<AssetInvestigationResponse> => {
    const qs =
      params?.includeInferred !== undefined
        ? `?includeInferred=${String(params.includeInferred)}`
        : "";
    const response = await request<{
      success: boolean;
      data: AssetInvestigationResponse;
    }>(`/intelligence/graph/investigate/asset/${encodeURIComponent(assetIdOrCode)}${qs}`);
    return response.data;
  },

  investigateGraphComplaint: async (
    complaintId: string,
    params?: { includeInferred?: boolean },
  ): Promise<ComplaintInvestigationResponse> => {
    const qs =
      params?.includeInferred !== undefined
        ? `?includeInferred=${String(params.includeInferred)}`
        : "";
    const response = await request<{
      success: boolean;
      data: ComplaintInvestigationResponse;
    }>(`/intelligence/graph/investigate/complaint/${encodeURIComponent(complaintId)}${qs}`);
    return response.data;
  },

  findGraphShortestPath: async (params: {
    from: string;
    to: string;
    maxDepth?: number;
    includeInferred?: boolean;
  }): Promise<ShortestPathResponse> => {
    const searchParams = new URLSearchParams({
      from: params.from,
      to: params.to,
    });
    if (params.maxDepth) searchParams.set("maxDepth", String(params.maxDepth));
    if (params.includeInferred !== undefined) {
      searchParams.set("includeInferred", String(params.includeInferred));
    }
    const response = await request<{ success: boolean; data: ShortestPathResponse }>(
      `/intelligence/graph/path?${searchParams.toString()}`,
    );
    return response.data;
  },

  getGraphMetrics: async (city?: string): Promise<GraphMetricsResponse> => {
    const qs = city && city !== "all" ? `?city=${encodeURIComponent(city)}` : "";
    const response = await request<{ success: boolean; data: GraphMetricsResponse }>(
      `/intelligence/graph/metrics${qs}`,
    );
    return response.data;
  },

  rebuildKnowledgeGraph: async (city?: string): Promise<RebuildGraphResponse> => {
    const response = await request<{ success: boolean; data: RebuildGraphResponse }>(
      "/intelligence/graph/rebuild",
      {
        method: "POST",
        body: JSON.stringify(city && city !== "all" ? { city } : {}),
      },
    );
    return response.data;
  },

  getCopilotDigest: async (params?: {
    city?: string;
    limit?: number;
  }): Promise<MorningDigestResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.city && params.city !== "all") searchParams.set("city", params.city);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    const response = await request<{ success: boolean; data: MorningDigestResponse }>(
      `/copilot/digest${qs ? `?${qs}` : ""}`,
    );
    return response.data;
  },

  askCopilot: async (payload: {
    question: string;
    sessionId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    assetCode?: string | null;
    complaintId?: string | null;
    city?: string | null;
    ward?: string | null;
    includeInferred?: boolean;
    useGemini?: boolean;
  }): Promise<AskCopilotResponse> => {
    const response = await request<{ success: boolean; data: AskCopilotResponse }>(
      "/copilot/ask",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    return response.data;
  },

  listCopilotSessions: async (params?: {
    city?: string;
    limit?: number;
  }): Promise<{ total: number; sessions: CopilotSession[] }> => {
    const searchParams = new URLSearchParams();
    if (params?.city && params.city !== "all") searchParams.set("city", params.city);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    const response = await request<{
      success: boolean;
      data: { total: number; sessions: CopilotSession[] };
    }>(`/copilot/sessions${qs ? `?${qs}` : ""}`);
    return response.data;
  },

  getCopilotSession: async (
    sessionId: string,
  ): Promise<{ session: CopilotSession; messages: CopilotMessage[] }> => {
    const response = await request<{
      success: boolean;
      data: { session: CopilotSession; messages: CopilotMessage[] };
    }>(`/copilot/sessions/${encodeURIComponent(sessionId)}`);
    return response.data;
  },

  decideCopilotRecommendation: async (
    recommendationId: string,
    payload: {
      decision: Exclude<RecommendationDecisionStatus, "PENDING">;
      modifiedAction?: string | null;
      decisionNote?: string | null;
    },
  ): Promise<{ recommendation: CopilotRecommendation }> => {
    const response = await request<{
      success: boolean;
      data: { recommendation: CopilotRecommendation };
    }>(`/copilot/recommendations/${encodeURIComponent(recommendationId)}/decision`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return response.data;
  },

  getCopilotMetrics: async (city?: string): Promise<CopilotMetricsResponse> => {
    const qs = city && city !== "all" ? `?city=${encodeURIComponent(city)}` : "";
    const response = await request<{ success: boolean; data: CopilotMetricsResponse }>(
      `/copilot/metrics${qs}`,
    );
    return response.data;
  },

  /**
   * Resolve administrative geography (city, ward, zone) for a coordinate pair.
   *
   * Uses PostGIS point-in-polygon (GCC Chennai boundary import) first,
   * then falls back to centroid-proximity for other known cities.
   * Returns resolved=false when the coordinate is outside supported coverage.
   */
  resolveAdminGeography: async (
    latitude: number,
    longitude: number,
  ): Promise<{
    resolved: boolean;
    method: string;
    city: string | null;
    ward: string | null;
    zone: string | null;
    wardId: string | null;
    zoneId: string | null;
    municipalityId: string | null;
    boundaryVersionId: string | null;
  }> => {
    const response = await request<{
      success: boolean;
      data: {
        resolved: boolean;
        method: string;
        city: string | null;
        ward: string | null;
        zone: string | null;
        wardId: string | null;
        zoneId: string | null;
        municipalityId: string | null;
        boundaryVersionId: string | null;
      };
    }>(`/spatial/resolve?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`);
    return response.data;
  },
};
