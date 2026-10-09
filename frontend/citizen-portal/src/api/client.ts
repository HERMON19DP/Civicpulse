import type { Complaint, CitizenProfile } from "../types/complaint";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";

export interface CreateComplaintPayload {
  title: string;
  description: string;
  category: string;
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
  login: (email: string, password: string) =>
    request<{ data: { accessToken: string; user: CitizenProfile } }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    ),

  createComplaint: (payload: CreateComplaintPayload) =>
    request<CreateComplaintResponse>("/complaints", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getMyComplaints: () => request<{ data: Complaint[] }>("/complaints/mine"),

  getComplaint: (id: string) =>
    request<{ data: Complaint }>(`/complaints/${id}`),

  getNearbyComplaints: (lat: number, lng: number) =>
    request<{ data: Complaint[] }>(
      `/complaints/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    ),

  getProfile: () => request<{ data: CitizenProfile }>("/citizens/me"),

  updateProfile: (payload: Partial<CitizenProfile>) =>
    request<{ data: CitizenProfile }>("/citizens/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
