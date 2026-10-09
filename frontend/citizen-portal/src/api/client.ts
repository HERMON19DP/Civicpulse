import type {
  Complaint,
  CitizenProfile,
  ComplaintCategory,
} from "../types/complaint";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";

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

export interface CreatedComplaint {
  id: string;
  referenceId: string;
  title: string;
  description: string;
  category: string;
  address: string;
  status: string;
  priority?: string | null;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateCandidate {
  complaintId: string;
  description: string;
  category: string;
  status: string;
  priority?: string | null;
  latitude: number;
  longitude: number;
  createdAt: string;
  similarity: number;
  upvoteCount: number;
  distanceMeters: number | null;
  categoryMatch: boolean;
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

  checkDuplicates: (payload: {
    description: string;
    category: ComplaintCategory;
    latitude: number;
    longitude: number;
  }) =>
    request<DuplicateCheckResponse>("/intelligence/duplicate-check", {
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

  getNearbyComplaints: (lat: number, lng: number) =>
    request<{ data: Complaint[] }>(
      `/complaints/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    ),

  getProfile: () => request<{ data: CitizenProfile }>("/users/me"),

  updateProfile: (payload: Partial<CitizenProfile>) =>
    request<{ data: CitizenProfile }>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
