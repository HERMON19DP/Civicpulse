export type ComplaintStatus = "open" | "in_progress" | "resolved" | "rejected";

export type ComplaintCategory =
  | "roads"
  | "water_supply"
  | "electricity"
  | "sanitation"
  | "public_safety"
  | "other";

export type ComplaintPriority = "low" | "medium" | "high" | "urgent";

export interface EvidenceFile {
  id: string;
  url: string;
  type: "image" | "video" | "document";
  uploadedAt: string;
}

export interface TimelineEvent {
  id: string;
  status: ComplaintStatus;
  note?: string;
  actor: string;
  timestamp: string;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  createdAt: string;
  updatedAt: string;
  citizenName: string;
  location: {
    address: string;
    ward: string;
    lat: number;
    lng: number;
  };
  evidence: EvidenceFile[];
  timeline: TimelineEvent[];
  assignedOfficer?: string;
  referenceId?: string;
}

export interface Officer {
  id: string;
  name: string;
  email: string;
  department: string;
  ward: string;
}
