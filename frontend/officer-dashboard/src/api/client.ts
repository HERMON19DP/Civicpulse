import type { Complaint } from "../types/complaint";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("cp_officer_token");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      body.error?.message ?? body.message ?? `Request failed: ${res.status}`,
    );
  }

  return body;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ data: LoginResponse }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getQueue: async (params?: {
    status?: string;
    category?: string;
    query?: string;
  }) => {
    const searchParams = new URLSearchParams();

    if (params?.status && params.status !== "all") {
      searchParams.set("status", params.status);
    }

    if (params?.category && params.category !== "all") {
      searchParams.set("category", params.category);
    }

    if (params?.query?.trim()) {
      searchParams.set("query", params.query.trim());
    }

    const qs = searchParams.toString();
    const response = await request<{
      data: {
        id: string;
        referenceId: string;
        title: string;
        description: string;
        category: string;
        address: string;
        status: string;
        priority: string;
        latitude: number | null;
        longitude: number | null;
        createdAt: string;
        updatedAt: string;
      }[];
    }>(`/complaints${qs ? `?${qs}` : ""}`);

    return response.data.map(
      (item) =>
        ({
          id: item.id,
          referenceId: item.referenceId,
          title: item.title,
          description: item.description,
          category: item.category as Complaint["category"],
          status: item.status as Complaint["status"],
          priority: (item.priority &&
          item.priority in
            {
              low: true,
              medium: true,
              high: true,
              urgent: true,
            }
            ? item.priority
            : "medium") as Complaint["priority"],
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          citizenName: "Citizen",
          location: {
            address: item.address,
            ward: "Not specified",
            lat: item.latitude ?? 0,
            lng: item.longitude ?? 0,
          },
          evidence: [],
          timeline: [],
        }) satisfies Complaint,
    );
  },

  getComplaint: (id: string) =>
    request<Complaint>(`/officers/complaints/${id}`),

  updateStatus: (id: string, status: string, note?: string) =>
    request<Complaint>(`/officers/complaints/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    }),

  getDashboardStats: () =>
    request<{
      open: number;
      inProgress: number;
      resolved: number;
      overdue: number;
    }>("/officers/dashboard/stats"),

  getMapComplaints: () => request<Complaint[]>("/officers/complaints/map"),
};
