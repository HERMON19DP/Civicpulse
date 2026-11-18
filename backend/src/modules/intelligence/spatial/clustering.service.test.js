jest.mock("./clustering.repository", () => ({
  findClusters: jest.fn(),
}));

jest.mock("../../../repositories/hotspot.repository", () => ({
  upsertHotspotWithMembers: jest.fn(),
  listHotspots: jest.fn(),
  queryWardComplaintStats: jest.fn(),
  findHotspotsByComplaintId: jest.fn(),
  listCityComplaintSummaries: jest.fn(),
}));

const { findClusters } = require("./clustering.repository");
const hotspotRepository = require("../../../repositories/hotspot.repository");
const {
  clusterComplaints,
  computeRecurrenceAndSeverity,
} = require("./clustering.service");
const hotspotService = require("./hotspot.service");
const { resolveWardAndZone, searchPlacesOffline } = require("./ward.resolver");

function makeRow(id, clusterId, latitude = 17.4156, longitude = 78.4357, overrides = {}) {
  return {
    id,
    reference_id: `CP-TEST-${id}`,
    title: `Test complaint ${id}`,
    description: "Test description",
    category: "roads",
    canonical_category: "ROAD",
    status: "SUBMITTED",
    priority: null,
    address: "4th Cross Rd, Banjara Hills",
    ward: "Ward 12 - Banjara Hills",
    zone: "Central Zone",
    latitude,
    longitude,
    created_at: new Date("2026-10-27T10:00:00Z"),
    cluster_id: clusterId,
    distance_meters: 10,
    ...overrides,
  };
}

const options = {
  latitude: 17.4156,
  longitude: 78.4357,
  radiusMeters: 5000,
  clusterDistanceMeters: 150,
  minClusterSize: 2,
};

describe("clusterComplaints & hotspotService (Layer 2)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("excludes singleton clusters when minClusterSize is 2", async () => {
    findClusters.mockResolvedValue([
      makeRow("A", "cluster-1"),
      makeRow("B", "cluster-1"),
      makeRow("C", "cluster-2"),
    ]);

    const result = await clusterComplaints(options);

    expect(result.clusterCount).toBe(1);
    expect(result.clusteredComplaintCount).toBe(2);
    expect(result.excludedComplaintCount).toBe(1);
    expect(result.clusters[0].complaintCount).toBe(2);
  });

  test("excludes clusters smaller than minClusterSize 3", async () => {
    findClusters.mockResolvedValue([
      makeRow("A", "cluster-1"),
      makeRow("B", "cluster-1"),
      makeRow("C", "cluster-2"),
      makeRow("D", "cluster-2"),
      makeRow("E", "cluster-2"),
    ]);

    const result = await clusterComplaints({
      ...options,
      minClusterSize: 3,
    });

    expect(result.clusterCount).toBe(1);
    expect(result.clusteredComplaintCount).toBe(3);
    expect(result.excludedComplaintCount).toBe(2);
    expect(result.clusters[0].complaintCount).toBe(3);
  });

  test("returns an empty result when no complaints are found", async () => {
    findClusters.mockResolvedValue([]);

    const result = await clusterComplaints(options);

    expect(result.clusterCount).toBe(0);
    expect(result.clusteredComplaintCount).toBe(0);
    expect(result.excludedComplaintCount).toBe(0);
    expect(result.clusters).toEqual([]);
  });

  test("detects cross-category overlap (ROAD + WATER_SUPPLY), severity, recurrence, and ward density", async () => {
    findClusters.mockResolvedValue([
      makeRow("1", "cluster-overlap", 17.4156, 78.4357, {
        canonical_category: "ROAD",
        priority: "HIGH",
        created_at: new Date("2026-10-20T10:00:00Z"),
      }),
      makeRow("2", "cluster-overlap", 17.4159, 78.436, {
        canonical_category: "ROAD",
        priority: "HIGH",
        created_at: new Date("2026-10-22T10:00:00Z"),
      }),
      makeRow("3", "cluster-overlap", 17.4161, 78.4362, {
        category: "WATER_SUPPLY",
        canonical_category: "WATER_SUPPLY",
        priority: "CRITICAL",
        created_at: new Date("2026-10-27T10:00:00Z"),
      }),
    ]);

    const result = await clusterComplaints(options);

    expect(result.clusterCount).toBe(1);
    expect(result.crossCategoryOverlapCount).toBe(1);
    expect(result.crossCategoryOverlaps).toHaveLength(1);

    const cluster = result.clusters[0];
    expect(cluster.hasCrossCategoryOverlap).toBe(true);
    expect(cluster.overlapCategories).toEqual(["ROAD", "WATER_SUPPLY"]);
    expect(cluster.overlapSummary).toContain("subsurface leakage");
    expect(cluster.severity).toBe("CRITICAL");
    expect(cluster.recurrenceScore).toBeGreaterThan(0.5);
    expect(cluster.radiusMeters).toBeGreaterThanOrEqual(50);
    expect(cluster.ward).toBe("Ward 12 - Banjara Hills");
    expect(cluster.zone).toBe("Central Zone");
  });

  test("detectAndPersistHotspots persists clusters and getWardAnalytics aggregates ward densities", async () => {
    findClusters.mockResolvedValue([
      makeRow("10", "cluster-a", 17.4156, 78.4357, { canonical_category: "ROAD" }),
      makeRow("11", "cluster-a", 17.416, 78.4361, { canonical_category: "WATER_SUPPLY" }),
    ]);

    hotspotRepository.upsertHotspotWithMembers.mockResolvedValue({ id: "hs-1" });
    hotspotRepository.listHotspots.mockResolvedValue([
      {
        id: "hs-1",
        hotspot_key: "ward-12-banjara-hills:17.4150:78.4350",
        title: "Ward 12: Road + Water Supply Overlap",
        ward: "Ward 12 - Banjara Hills",
        zone: "Central Zone",
        center_latitude: 17.4158,
        center_longitude: 78.4359,
        radius_meters: 80,
        dominant_category: "ROAD",
        issue_categories: ["ROAD", "WATER_SUPPLY"],
        category_counts: { ROAD: 1, WATER_SUPPLY: 1 },
        complaint_count: 2,
        open_count: 2,
        density_per_sq_km: 99.5,
        recurrence_score: 0.51,
        confidence: 0.81,
        severity: "HIGH",
        has_cross_category_overlap: true,
        overlap_categories: ["ROAD", "WATER_SUPPLY"],
        overlap_summary: "Overlap alert",
        status: "ACTIVE",
        metadata: {},
        detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        members: [],
      },
    ]);

    const persisted = await hotspotService.detectAndPersistHotspots({ cityWide: true });
    expect(hotspotRepository.upsertHotspotWithMembers).toHaveBeenCalledTimes(1);
    expect(persisted.detectedCount).toBe(1);
    expect(persisted.persistedCount).toBe(1);
    expect(persisted.crossCategoryOverlapCount).toBe(1);

    hotspotRepository.queryWardComplaintStats.mockResolvedValue({
      rows: [
        {
          ward: "Ward 12 - Banjara Hills",
          zone: "Central Zone",
          canonical_category: "ROAD",
          status: "SUBMITTED",
          effective_priority: "HIGH",
          latitude: 17.4156,
          longitude: 78.4357,
        },
        {
          ward: "Ward 12 - Banjara Hills",
          zone: "Central Zone",
          canonical_category: "WATER_SUPPLY",
          status: "IN_PROGRESS",
          effective_priority: "HIGH",
          latitude: 17.416,
          longitude: 78.436,
        },
      ],
      hotspotCountsByWard: new Map([
        ["Ward 12 - Banjara Hills", { activeHotspots: 1, overlapHotspots: 1 }],
      ]),
    });

    const wardReport = await hotspotService.getWardAnalytics();
    expect(wardReport.totalWards).toBe(1);
    expect(wardReport.wards[0].ward).toBe("Ward 12 - Banjara Hills");
    expect(wardReport.wards[0].totalComplaints).toBe(2);
    expect(wardReport.wards[0].activeHotspots).toBe(1);
    expect(wardReport.wards[0].overlapHotspots).toBe(1);
    expect(wardReport.wards[0].densityPerSqKm).toBeGreaterThan(0);
  });

  test("resolves multi-city wards/cities safely including Kerala, Bengaluru, arbitrary addresses, and lists active cities", async () => {
    const kerala = resolveWardAndZone({
      latitude: 8.76284,
      longitude: 76.79146,
      address: "Kalambalam, Trivandrum, Kerala, India",
    });
    expect(kerala.city).toBe("Thiruvananthapuram");
    expect(kerala.ward).toContain("Kalambalam");

    const bengaluru = resolveWardAndZone({
      latitude: 12.9784,
      longitude: 77.6408,
      address: "100 Ft Road, Indiranagar, Bengaluru",
    });
    expect(bengaluru.city).toBe("Bengaluru");
    expect(bengaluru.ward).toContain("Indiranagar");

    const customGlobal = resolveWardAndZone({
      latitude: null,
      longitude: null,
      address: "MI Road, Jaipur, Rajasthan, India",
    });
    expect(customGlobal.city).toBe("Jaipur");
    expect(customGlobal.ward).toContain("MI Road");

    const matches = searchPlacesOffline("Kalambalam");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].city).toBe("Thiruvananthapuram");

    hotspotRepository.listCityComplaintSummaries.mockResolvedValue([
      {
        city: "Hyderabad",
        complaintCount: 9,
        openCount: 9,
        hotspotCount: 3,
        overlapCount: 1,
        center: { latitude: 17.4156, longitude: 78.4357 },
      },
      {
        city: "Thiruvananthapuram",
        complaintCount: 3,
        openCount: 3,
        hotspotCount: 1,
        overlapCount: 1,
        center: { latitude: 8.7628, longitude: 76.7915 },
      },
    ]);

    const citiesPayload = await hotspotService.listActiveCities();
    expect(citiesPayload.totalCities).toBe(2);
    expect(citiesPayload.cities.map((c) => c.city)).toEqual([
      "Hyderabad",
      "Thiruvananthapuram",
    ]);
    expect(citiesPayload.directory.length).toBeGreaterThanOrEqual(5);
  });

  test("computeRecurrenceAndSeverity applies deterministic, explainable 4-tier rules", () => {
    const nowMs = new Date("2026-11-18T12:00:00Z").getTime();
    const recentDate = new Date("2026-11-17T12:00:00Z").toISOString();
    const oldDate = new Date("2026-10-25T12:00:00Z").toISOString(); // 24 days old

    // 1. Three recent minor (LOW) complaints must NOT escalate to HIGH
    const threeMinor = [
      { status: "SUBMITTED", priority: "LOW", canonicalCategory: "ROAD", createdAt: recentDate },
      { status: "SUBMITTED", priority: "LOW", canonicalCategory: "ROAD", createdAt: recentDate },
      { status: "SUBMITTED", priority: "LOW", canonicalCategory: "ROAD", createdAt: recentDate },
    ];
    expect(
      computeRecurrenceAndSeverity(threeMinor, false, { ROAD: 3 }, nowMs).severity,
    ).toBe("LOW");

    // 2. Non-high-risk overlap (e.g., ROAD + SANITATION with 2 MEDIUM recent complaints) -> MEDIUM (not HIGH)
    const generalOverlap = [
      { status: "SUBMITTED", priority: "MEDIUM", canonicalCategory: "ROAD", createdAt: recentDate },
      { status: "SUBMITTED", priority: "MEDIUM", canonicalCategory: "SANITATION", createdAt: recentDate },
    ];
    expect(
      computeRecurrenceAndSeverity(generalOverlap, true, { ROAD: 1, SANITATION: 1 }, nowMs).severity,
    ).toBe("MEDIUM");

    // 3. High-risk overlap (ROAD + WATER_SUPPLY with 2 open complaints) -> HIGH
    const highRiskOverlap = [
      { status: "SUBMITTED", priority: "MEDIUM", canonicalCategory: "ROAD", createdAt: recentDate },
      { status: "IN_PROGRESS", priority: "MEDIUM", canonicalCategory: "WATER_SUPPLY", createdAt: recentDate },
    ];
    expect(
      computeRecurrenceAndSeverity(highRiskOverlap, true, { ROAD: 1, WATER_SUPPLY: 1 }, nowMs).severity,
    ).toBe("HIGH");

    // 4. High-risk overlap with 4+ open complaints -> CRITICAL
    const criticalOverlap = [
      { status: "SUBMITTED", priority: "MEDIUM", canonicalCategory: "ROAD", createdAt: recentDate },
      { status: "SUBMITTED", priority: "MEDIUM", canonicalCategory: "ROAD", createdAt: recentDate },
      { status: "SUBMITTED", priority: "MEDIUM", canonicalCategory: "WATER_SUPPLY", createdAt: recentDate },
      { status: "IN_PROGRESS", priority: "MEDIUM", canonicalCategory: "WATER_SUPPLY", createdAt: recentDate },
    ];
    expect(
      computeRecurrenceAndSeverity(criticalOverlap, true, { ROAD: 2, WATER_SUPPLY: 2 }, nowMs).severity,
    ).toBe("CRITICAL");

    // 5. Aged unresolved backlog (3 MEDIUM complaints with >= 2 aged >= 14 days) -> HIGH
    const agedBacklog = [
      { status: "SUBMITTED", priority: "MEDIUM", canonicalCategory: "ROAD", createdAt: oldDate },
      { status: "SUBMITTED", priority: "MEDIUM", canonicalCategory: "ROAD", createdAt: oldDate },
      { status: "SUBMITTED", priority: "MEDIUM", canonicalCategory: "ROAD", createdAt: recentDate },
    ];
    expect(
      computeRecurrenceAndSeverity(agedBacklog, false, { ROAD: 3 }, nowMs).severity,
    ).toBe("HIGH");

    // 6. Fully resolved cluster -> LOW regardless of past priorities
    const resolvedCluster = [
      { status: "RESOLVED", priority: "CRITICAL", canonicalCategory: "WATER_SUPPLY", createdAt: oldDate },
      { status: "RESOLVED", priority: "HIGH", canonicalCategory: "ROAD", createdAt: oldDate },
    ];
    expect(
      computeRecurrenceAndSeverity(resolvedCluster, true, { WATER_SUPPLY: 1, ROAD: 1 }, nowMs).severity,
    ).toBe("LOW");
  });

  test("getWardAnalytics aggregates zones, status breakdowns, and administrative geography IDs", async () => {
    hotspotRepository.queryWardComplaintStats.mockResolvedValue({
      rows: [
        {
          city: "Chennai",
          ward: "Ward 121",
          zone: "Zone 9 - Teynampet",
          administrative_ward_id: "adm-w-121",
          administrative_zone_id: "adm-z-9",
          administrative_boundary_version_id: "ver-gcc-1",
          canonical_category: "ROAD",
          status: "SUBMITTED",
          effective_priority: "HIGH",
          latitude: 13.0418,
          longitude: 80.2341,
        },
        {
          city: "Chennai",
          ward: "Ward 122",
          zone: "Zone 9 - Teynampet",
          administrative_ward_id: "adm-w-122",
          administrative_zone_id: "adm-z-9",
          administrative_boundary_version_id: "ver-gcc-1",
          canonical_category: "WATER_SUPPLY",
          status: "RESOLVED",
          effective_priority: "MEDIUM",
          latitude: 13.043,
          longitude: 80.236,
        },
      ],
      hotspotCountsByWard: new Map([
        ["Chennai::Ward 121", { activeHotspots: 1, overlapHotspots: 0 }],
      ]),
    });

    const analytics = await hotspotService.getWardAnalytics({ city: "Chennai" });
    expect(analytics.totalWards).toBe(2);
    expect(analytics.totalZones).toBe(1);
    expect(analytics.totalComplaints).toBe(2);
    expect(analytics.openComplaints).toBe(1);
    expect(analytics.wards[0].administrativeWardId).toBe("adm-w-121");
    expect(analytics.wards[0].statusCounts).toEqual({ SUBMITTED: 1 });
    expect(analytics.zones[0].zone).toBe("Zone 9 - Teynampet");
    expect(analytics.zones[0].administrativeZoneId).toBe("adm-z-9");
    expect(analytics.zones[0].wardCount).toBe(2);
    expect(analytics.zones[0].openComplaints).toBe(1);
    expect(analytics.zones[0].resolvedComplaints).toBe(1);
    expect(analytics.zones[0].statusCounts).toEqual({ SUBMITTED: 1, RESOLVED: 1 });
  });
});
