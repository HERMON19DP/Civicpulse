import type {
  ActiveCitiesResponse,
  AssignedOfficerInfo,
  CitizenProfile,
  ComplaintCategory,
  ComplaintIntelligence,
  EvidenceFile,
  GeocodeResponse,
  NearbyComplaint,
} from "../types/complaint";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";
const API_ORIGIN = BASE_URL.replace(/\/api\/v1\/?$/, "");

export function resolveAssetUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "CITIZEN" | "OFFICER" | "ADMIN" | string;
}

export interface CreateComplaintPayload {
  title: string;
  description: string;
  category: ComplaintCategory;
  address: string;
  latitude: number;
  longitude: number;
}

export interface EvidencePayload {
  id: string;
  complaintId?: string;
  originalName?: string;
  mimeType?: string;
  type: "image" | "video" | "document";
  fileSize?: number;
  url: string;
  uploadedAt: string;
}

export interface RawTimelinePayload {
  id: string;
  fromStatus?: string | null;
  status: string;
  actor: string;
  actorRole?: string;
  note?: string;
  timestamp: string;
}

export interface CreatedComplaint {
  id: string;
  referenceId: string;
  title: string;
  description: string;
  category: string;
  department?: string | null;
  assignedOfficer?: AssignedOfficerInfo | null;
  address: string;
  city?: string | null;
  ward?: string | null;
  status: string;
  priority?: string | null;
  latitude: number;
  longitude: number;
  evidence?: EvidencePayload[];
  timeline?: RawTimelinePayload[];
  intelligence?: ComplaintIntelligence | null;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateCandidate {
  complaintId: string;
  referenceId?: string | null;
  title?: string | null;
  description: string;
  category: string;
  canonicalCategory?: string | null;
  status: string;
  priority?: string | null;
  ward?: string | null;
  latitude: number;
  longitude: number;
  createdAt: string;
  similarity: number;
  combinedScore?: number;
  upvoteCount: number;
  distanceMeters: number | null;
  daysApart?: number | null;
  categoryMatch: boolean;
  matchReasons?: string[];
}

export interface DuplicateCheckResponse {
  success: boolean;
  hasPossibleDuplicates: boolean;
  candidates: DuplicateCandidate[];
}

export interface CreateComplaintResponse {
  data: CreatedComplaint;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("cp_citizen_token");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith("/auth/")) {
      localStorage.removeItem("cp_citizen_token");
      localStorage.removeItem("cp_citizen_profile");
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }

    throw new Error(
      body?.error?.message ?? body?.message ?? `Request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

export const api = {
  register: (payload: { name: string; email: string; password: string }) =>
    request<{ data: AuthUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (email: string, password: string) =>
    request<{
      data: {
        accessToken: string;
        user: AuthUser;
      };
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  createComplaint: (payload: CreateComplaintPayload) =>
    request<CreateComplaintResponse>("/complaints", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadComplaintEvidence: async (
    complaintId: string,
    files: File[],
  ): Promise<{ data: EvidenceFile[] }> => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    const res = await request<{ data: EvidencePayload[] }>(
      `/complaints/${encodeURIComponent(complaintId)}/evidence`,
      {
        method: "POST",
        body: formData,
      },
    );

    return {
      data: res.data.map((e) => ({
        id: e.id,
        url: resolveAssetUrl(e.url),
        type: e.type || "document",
        originalName: e.originalName,
        mimeType: e.mimeType,
        fileSize: e.fileSize,
        uploadedAt: e.uploadedAt,
      })),
    };
  },

  checkDuplicates: (payload: {
    title?: string;
    description: string;
    category: ComplaintCategory;
    latitude: number;
    longitude: number;
    timeWindowDays?: number;
  }) =>
    request<DuplicateCheckResponse>("/intelligence/duplicate-check", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  submitAiFeedback: (payload: {
    eventType: "DUPLICATE_SUGGESTION";
    action: "ACCEPTED" | "MODIFIED" | "REJECTED";
    complaintId?: string | null;
    targetComplaintId?: string | null;
    suggestedValue?: string | null;
    finalValue?: string | null;
    metadata?: Record<string, unknown>;
  }) =>
    request<{ data: unknown }>("/intelligence/feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  upvoteComplaint: (complaintId: string) =>
    request<{
      success: boolean;
      created: boolean;
      upvoteCount: number;
      message: string;
    }>(`/complaints/${encodeURIComponent(complaintId)}/upvote`, {
      method: "POST",
    }),

  getMyComplaints: () =>
    request<{ data: CreatedComplaint[] }>("/complaints/mine"),

  getComplaint: (id: string) =>
    request<{ data: CreatedComplaint }>(`/complaints/${id}`),

  getNearbyComplaints: (
    lat: number,
    lng: number,
    radius = 5000,
    category = "all",
    city = "all",
  ) => {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radius),
    });
    if (category && category !== "all") {
      params.set("category", category);
    }
    if (city && city !== "all") {
      params.set("city", city);
    }
    return request<{ data: NearbyComplaint[] }>(
      `/complaints/nearby?${params.toString()}`,
    );
  },

  getSpatialCities: async (): Promise<ActiveCitiesResponse> => {
    const res = await request<{ success: boolean; data: ActiveCitiesResponse }>(
      "/spatial/cities",
    );
    return res.data;
  },

  geocodePlace: async (query: string): Promise<GeocodeResponse> => {
    const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const res = await request<{ success: boolean; data: GeocodeResponse }>(
      `/spatial/geocode${qs}`,
    );
    return res.data;
  },

  getProfile: () => request<{ data: CitizenProfile }>("/users/me"),

  updateProfile: (payload: Partial<CitizenProfile>) =>
    request<{ data: CitizenProfile }>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{
      data: {
        id: string;
        updatedAt: string;
        message: string;
      };
    }>("/users/me/password", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
