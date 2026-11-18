export type ComplaintStatus = "open" | "in_progress" | "resolved" | "rejected";

export type ComplaintCategory =
  | "roads"
  | "water_supply"
  | "electricity"
  | "sanitation"
  | "public_safety"
  | "other";

export interface EvidenceFile {
  id: string;
  url: string;
  type: "image" | "video" | "document";
  originalName?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt: string;
}

export interface TimelineEvent {
  id: string;
  fromStatus?: string | null;
  status: ComplaintStatus;
  rawStatus?: string;
  note?: string;
  actor: string; // "You" | officer name | "System"
  actorRole?: string;
  timestamp: string;
}

export interface AssignedOfficerInfo {
  id: string;
  name: string;
  email?: string | null;
}

export interface ComplaintIntelligence {
  aiCategory: string | null;
  aiPriority: string | null;
  aiSummary: string | null;
  aiConfidence: number | null;
  aiTags: string[];
  aiMetadata?: {
    department?: string | null;
    rationale?: string | null;
    keyPoints?: string[];
    recommendedAction?: string | null;
    classificationProvenance?: {
      source?: string;
      modelName?: string | null;
    } | null;
  } | null;
  enrichmentStatus: string;
  enrichedAt: string | null;
}

export interface Complaint {
  id: string;
  referenceId?: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  department?: string | null;
  status: ComplaintStatus;
  priority?: string | null;
  createdAt: string;
  updatedAt: string;
  location: {
    address: string;
    city?: string | null;
    ward?: string | null;
    lat: number;
    lng: number;
  };
  evidence: EvidenceFile[];
  timeline: TimelineEvent[];
  assignedOfficer?: AssignedOfficerInfo | null;
  intelligence?: ComplaintIntelligence | null;
}

export interface NearbyComplaint {
  id: string;
  referenceId: string;
  title: string;
  description: string;
  category: string;
  department?: string | null;
  status: string;
  priority?: string | null;
  address: string;
  city?: string | null;
  ward?: string | null;
  zone?: string | null;
  latitude: number;
  longitude: number;
  aiSummary?: string | null;
  upvoteCount: number;
  distanceMeters: number;
  isOwnComplaint: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CitizenProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  ward?: string;
  notificationPrefs: {
    email: boolean;
    sms: boolean;
  };
}

export interface CurrentUserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  updated_at?: string;
}

export interface ActiveCitySummary {
  city: string;
  complaintCount: number;
  openCount: number;
  hotspotCount: number;
  overlapCount: number;
  center: {
    latitude: number;
    longitude: number;
  } | null;
}

export interface ActiveCitiesResponse {
  totalCities: number;
  cities: ActiveCitySummary[];
}

export interface GeocodePlaceResult {
  label: string;
  city: string;
  ward?: string | null;
  zone?: string | null;
  state?: string | null;
  country?: string | null;
  latitude: number;
  longitude: number;
  complaintCount?: number;
  source: string;
}

export interface GeocodeResponse {
  query: string;
  results: GeocodePlaceResult[];
}
