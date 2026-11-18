const clusteringService = require("./clustering.service");
const hotspotRepository = require("../../../repositories/hotspot.repository");
const graphBuilder = require("../graph/graph-builder.service");
const {
  KNOWN_CITY_HUBS,
  haversineMeters,
  getWardAreaSqKm,
  normalizeCityName,
  searchPlacesOffline,
} = require("./ward.resolver");

const CLOSED_STATUSES = new Set(["RESOLVED", "REJECTED"]);

function buildHotspotKey(cluster) {
  // ~275m grid snapping keeps nearby re-detections idempotent across incremental updates
  const latBucket = (Math.round(cluster.centroid.latitude * 400) / 400).toFixed(4);
  const lngBucket = (Math.round(cluster.centroid.longitude * 400) / 400).toFixed(4);
  const wardSlug = String(cluster.ward || "ward")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${wardSlug}:${latBucket}:${lngBucket}`;
}

function serializeHotspotRow(row) {
  const members = Array.isArray(row.members) ? row.members : [];
  return {
    id: row.id,
    hotspotKey: row.hotspot_key,
    title: row.title,
    city: row.city || null,
    ward: row.ward,
    zone: row.zone,
    centroid: {
      latitude: Number(row.center_latitude),
      longitude: Number(row.center_longitude),
    },
    radiusMeters: Number(row.radius_meters),
    dominantCategory: row.dominant_category,
    issueCategories: Array.isArray(row.issue_categories) ? row.issue_categories : [],
    categoryCounts: row.category_counts || {},
    complaintCount: Number(row.complaint_count || 0),
    openCount: Number(row.open_count || 0),
    densityPerSqKm: Number(row.density_per_sq_km || 0),
    recurrenceScore: Number(row.recurrence_score || 0),
    confidence: Number(row.confidence || 0),
    severity: row.severity,
    hasCrossCategoryOverlap: Boolean(row.has_cross_category_overlap),
    overlapCategories: Array.isArray(row.overlap_categories)
      ? row.overlap_categories
      : [],
    overlapSummary: row.overlap_summary || null,
    timeWindowDays: row.time_window_days ?? null,
    firstReportedAt: row.first_reported_at,
    lastReportedAt: row.last_reported_at,
    status: row.status,
    metadata: row.metadata || {},
    detectedAt: row.detected_at,
    updatedAt: row.updated_at,
    complaints: members.map((m) => ({
      id: m.id,
      referenceId: m.reference_id,
      title: m.title,
      description: m.description,
      category: m.category,
      canonicalCategory: m.canonical_category,
      status: m.status,
      priority: m.priority,
      address: m.address,
      city: m.city || null,
      ward: m.ward || null,
      zone: m.zone || null,
      latitude: Number(m.latitude),
      longitude: Number(m.longitude),
      distanceMeters: Number(m.distance_from_center_meters || 0),
      createdAt: m.created_at,
    })),
  };
}

async function detectAndPersistHotspots(options = {}) {
  const cityWide =
    options.cityWide !== undefined
      ? Boolean(options.cityWide)
      : options.latitude == null || options.longitude == null;

  const clusteringResult = await clusteringService.clusterComplaints({
    latitude: options.latitude ?? null,
    longitude: options.longitude ?? null,
    radiusMeters: options.radiusMeters ?? 50000,
    clusterDistanceMeters: options.clusterDistanceMeters ?? 150,
    minClusterSize: options.minClusterSize ?? 2,
    category: options.category,
    timeWindowDays: options.timeWindowDays,
    city: options.city,
    ward: options.ward,
    cityWide,
  });

  const savedIds = [];
  for (const cluster of clusteringResult.clusters) {
    const hotspotKey = buildHotspotKey(cluster);
    const memberLinks = cluster.complaints.map((c) => ({
      complaintId: c.id,
      distanceFromCenterMeters:
        haversineMeters(
          cluster.centroid.latitude,
          cluster.centroid.longitude,
          c.latitude,
          c.longitude,
        ) ?? 0,
    }));

    const saved = await hotspotRepository.upsertHotspotWithMembers(
      {
        hotspotKey,
        title: cluster.title,
        city: cluster.city || null,
        ward: cluster.ward,
        zone: cluster.zone,
        centerLatitude: cluster.centroid.latitude,
        centerLongitude: cluster.centroid.longitude,
        radiusMeters: cluster.radiusMeters,
        dominantCategory: cluster.dominantCategory,
        issueCategories: cluster.issueCategories,
        categoryCounts: cluster.categoryCounts,
        complaintCount: cluster.complaintCount,
        openCount: cluster.openCount,
        densityPerSqKm: cluster.densityPerSqKm,
        recurrenceScore: cluster.recurrenceScore,
        confidence: cluster.confidence,
        severity: cluster.severity,
        hasCrossCategoryOverlap: cluster.hasCrossCategoryOverlap,
        overlapCategories: cluster.overlapCategories,
        overlapSummary: cluster.overlapSummary,
        timeWindowDays: options.timeWindowDays ?? null,
        firstReportedAt: cluster.firstReportedAt,
        lastReportedAt: cluster.lastReportedAt,
        metadata: {
          source: "dbscan-connected-components",
          clusterDistanceMeters: options.clusterDistanceMeters ?? 150,
          minClusterSize: options.minClusterSize ?? 2,
          cityWide,
          city: cluster.city || null,
          detectedBy: "layer2-spatial-service",
        },
      },
      memberLinks,
    );

    if (saved) {
      savedIds.push(saved.id);
    }
  }

  const persistedHotspots = await hotspotRepository.listHotspots({
    city: options.city,
    ward: options.ward,
    limit: 50,
  });

  const hotspots = persistedHotspots.map(serializeHotspotRow);

  if (!options.skipGraphSync && process.env.NODE_ENV !== "test") {
    graphBuilder
      .syncKnowledgeGraph({ city: options.city || null })
      .catch(() => {});
  }

  return {
    detectedCount: clusteringResult.clusters.length,
    persistedCount: savedIds.length,
    totalComplaintsAnalyzed: clusteringResult.totalComplaintsAnalyzed,
    crossCategoryOverlapCount: hotspots.filter((h) => h.hasCrossCategoryOverlap)
      .length,
    hotspots,
  };
}

async function listSavedHotspots(filters = {}) {
  const rows = await hotspotRepository.listHotspots(filters);
  const hotspots = rows.map(serializeHotspotRow);
  return {
    total: hotspots.length,
    activeCount: hotspots.filter((h) => h.status === "ACTIVE").length,
    crossCategoryOverlapCount: hotspots.filter((h) => h.hasCrossCategoryOverlap)
      .length,
    hotspots,
  };
}

async function getHotspotsForComplaint(complaintId) {
  if (typeof hotspotRepository.findHotspotsByComplaintId !== "function") {
    return [];
  }
  const rows = await hotspotRepository.findHotspotsByComplaintId(complaintId);
  return rows.map((row) => ({
    ...serializeHotspotRow(row),
    distanceFromCenterMeters:
      row.distance_from_center_meters != null
        ? Number(row.distance_from_center_meters)
        : null,
  }));
}

async function getWardAnalytics({
  city = null,
  timeWindowDays = null,
  category = null,
} = {}) {
  const { rows, hotspotCountsByWard } =
    await hotspotRepository.queryWardComplaintStats({
      city,
      timeWindowDays,
      category,
    });

  const wardMap = new Map();

  for (const row of rows) {
    const cityName = row.city || "General Jurisdiction";
    const wardName = row.ward || "Unassigned Ward";
    const zoneName = row.zone || "General Jurisdiction";
    const adminWardId = row.administrative_ward_id || null;
    const adminZoneId = row.administrative_zone_id || null;
    const adminBoundaryVersionId = row.administrative_boundary_version_id || null;

    // Prefer administrative_ward_id when present so aggregation uses canonical geography IDs
    const key = adminWardId
      ? `admin-ward::${adminWardId}`
      : `${cityName}::${wardName}`;

    if (!wardMap.has(key)) {
      const areaSqKm = getWardAreaSqKm(wardName);
      const hotspotMeta = hotspotCountsByWard.get(`${cityName}::${wardName}`) ||
        hotspotCountsByWard.get(wardName) || {
          activeHotspots: 0,
          overlapHotspots: 0,
        };
      wardMap.set(key, {
        city: cityName,
        ward: wardName,
        zone: zoneName,
        administrativeWardId: adminWardId,
        administrativeZoneId: adminZoneId,
        administrativeBoundaryVersionId: adminBoundaryVersionId,
        areaSqKm,
        totalComplaints: 0,
        openComplaints: 0,
        resolvedComplaints: 0,
        highOrCriticalCount: 0,
        categoryCounts: {},
        statusCounts: {},
        activeHotspots: hotspotMeta.activeHotspots,
        overlapHotspots: hotspotMeta.overlapHotspots,
        latSum: 0,
        lngSum: 0,
        geoCount: 0,
      });
    }

    const entry = wardMap.get(key);
    entry.totalComplaints += 1;

    const statusUpper = String(row.status || "SUBMITTED").toUpperCase();
    entry.statusCounts[statusUpper] = (entry.statusCounts[statusUpper] || 0) + 1;
    if (statusUpper === "RESOLVED") {
      entry.resolvedComplaints += 1;
    }
    if (!CLOSED_STATUSES.has(statusUpper)) {
      entry.openComplaints += 1;
    }

    const prioUpper = String(row.effective_priority || "").toUpperCase();
    if (prioUpper === "HIGH" || prioUpper === "CRITICAL") {
      entry.highOrCriticalCount += 1;
    }

    const cat = row.canonical_category || "OTHER";
    entry.categoryCounts[cat] = (entry.categoryCounts[cat] || 0) + 1;

    if (row.latitude != null && row.longitude != null) {
      entry.latSum += Number(row.latitude);
      entry.lngSum += Number(row.longitude);
      entry.geoCount += 1;
    }
  }

  const wards = Array.from(wardMap.values())
    .map((entry) => {
      const sortedCats = Object.entries(entry.categoryCounts).sort(
        (a, b) => b[1] - a[1],
      );
      return {
        city: entry.city,
        ward: entry.ward,
        zone: entry.zone,
        administrativeWardId: entry.administrativeWardId,
        administrativeZoneId: entry.administrativeZoneId,
        administrativeBoundaryVersionId: entry.administrativeBoundaryVersionId,
        areaSqKm: entry.areaSqKm,
        totalComplaints: entry.totalComplaints,
        openComplaints: entry.openComplaints,
        resolvedComplaints: entry.resolvedComplaints,
        highOrCriticalCount: entry.highOrCriticalCount,
        densityPerSqKm: Number(
          (entry.totalComplaints / Math.max(0.5, entry.areaSqKm)).toFixed(2),
        ),
        dominantCategory: sortedCats[0]?.[0] || "OTHER",
        categoryCounts: entry.categoryCounts,
        statusCounts: entry.statusCounts,
        activeHotspots: entry.activeHotspots,
        overlapHotspots: entry.overlapHotspots,
        center:
          entry.geoCount > 0
            ? {
                latitude: Number((entry.latSum / entry.geoCount).toFixed(6)),
                longitude: Number((entry.lngSum / entry.geoCount).toFixed(6)),
              }
            : null,
      };
    })
    .sort((a, b) => b.totalComplaints - a.totalComplaints);

  // Aggregate zones while preserving ward-to-zone relationships
  const zoneMap = new Map();
  for (const w of wards) {
    const zoneKey = w.administrativeZoneId
      ? `admin-zone::${w.administrativeZoneId}`
      : `${w.city}::${w.zone}`;

    if (!zoneMap.has(zoneKey)) {
      zoneMap.set(zoneKey, {
        city: w.city,
        zone: w.zone,
        administrativeZoneId: w.administrativeZoneId || null,
        wardCount: 0,
        wards: [],
        totalComplaints: 0,
        openComplaints: 0,
        resolvedComplaints: 0,
        highOrCriticalCount: 0,
        categoryCounts: {},
        statusCounts: {},
        hotspotCount: 0,
        overlapHotspots: 0,
      });
    }

    const zEntry = zoneMap.get(zoneKey);
    zEntry.wardCount += 1;
    zEntry.wards.push(w.ward);
    zEntry.totalComplaints += w.totalComplaints;
    zEntry.openComplaints += w.openComplaints;
    zEntry.resolvedComplaints += w.resolvedComplaints;
    zEntry.highOrCriticalCount += w.highOrCriticalCount;
    zEntry.hotspotCount += w.activeHotspots;
    zEntry.overlapHotspots += w.overlapHotspots;

    for (const [cat, cnt] of Object.entries(w.categoryCounts)) {
      zEntry.categoryCounts[cat] = (zEntry.categoryCounts[cat] || 0) + cnt;
    }
    for (const [st, cnt] of Object.entries(w.statusCounts)) {
      zEntry.statusCounts[st] = (zEntry.statusCounts[st] || 0) + cnt;
    }
  }

  const zones = Array.from(zoneMap.values())
    .map((z) => {
      const sortedCats = Object.entries(z.categoryCounts).sort(
        (a, b) => b[1] - a[1],
      );
      return {
        ...z,
        dominantCategory: sortedCats[0]?.[0] || "OTHER",
      };
    })
    .sort((a, b) => b.totalComplaints - a.totalComplaints);

  const openComplaints = wards.reduce((sum, w) => sum + w.openComplaints, 0);

  return {
    city: city || null,
    timeWindowDays: timeWindowDays ?? null,
    totalWards: wards.length,
    totalZones: zones.length,
    totalComplaints: rows.length,
    openComplaints,
    wards,
    zones,
  };
}

async function listActiveCities() {
  const dbCities =
    typeof hotspotRepository.listCityComplaintSummaries === "function"
      ? await hotspotRepository.listCityComplaintSummaries()
      : [];

  const activeNames = new Set(dbCities.map((c) => c.city.toLowerCase()));
  const directory = KNOWN_CITY_HUBS.map((hub) => ({
    city: hub.city,
    state: hub.state,
    country: hub.country,
    center: {
      latitude: hub.latitude,
      longitude: hub.longitude,
    },
    hasComplaints: activeNames.has(hub.city.toLowerCase()),
  }));

  return {
    totalCities: dbCities.length,
    cities: dbCities,
    directory,
  };
}

async function geocodePlaceQuery(query) {
  const trimmed = String(query || "").trim();
  const offlineMatches = searchPlacesOffline(trimmed);

  const dbCities =
    typeof hotspotRepository.listCityComplaintSummaries === "function"
      ? await hotspotRepository.listCityComplaintSummaries().catch(() => [])
      : [];

  const dbMatches = dbCities
    .filter(
      (c) =>
        c.center &&
        (!trimmed || c.city.toLowerCase().includes(trimmed.toLowerCase())),
    )
    .map((c) => ({
      label: `${c.city} (${c.complaintCount} civic reports)`,
      city: c.city,
      latitude: c.center.latitude,
      longitude: c.center.longitude,
      complaintCount: c.complaintCount,
      source: "active-complaints",
    }));

  let nominatimMatches = [];
  if (trimmed.length >= 2 && typeof fetch === "function") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(trimmed)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "CivicPulse-CivicIntelligence/1.0",
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (response.ok) {
        const items = await response.json();
        if (Array.isArray(items)) {
          nominatimMatches = items
            .map((item) => {
              const addr = item.address || {};
              const rawCity =
                addr.city ||
                addr.town ||
                addr.state_district ||
                addr.county ||
                addr.village ||
                null;
              const lat = Number(item.lat);
              const lng = Number(item.lon);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              return {
                label: item.display_name || trimmed,
                city: normalizeCityName(rawCity) || rawCity || trimmed,
                state: addr.state || null,
                country: addr.country || null,
                latitude: Number(lat.toFixed(6)),
                longitude: Number(lng.toFixed(6)),
                source: "nominatim",
              };
            })
            .filter(Boolean);
        }
      }
    } catch {
      // Offline / sandboxed environments fall back gracefully to local directory + DB cities
    } finally {
      clearTimeout(timer);
    }
  }

  const combined = [...dbMatches, ...offlineMatches, ...nominatimMatches];
  const deduped = [];
  const seenKeys = new Set();

  for (const place of combined) {
    const bucketKey = `${place.city?.toLowerCase() || ""}:${place.latitude.toFixed(2)}:${place.longitude.toFixed(2)}:${place.source}`;
    const geoBucket = `${place.latitude.toFixed(2)}:${place.longitude.toFixed(2)}`;
    if (seenKeys.has(bucketKey) || (place.source === "nominatim" && seenKeys.has(geoBucket))) {
      continue;
    }
    seenKeys.add(bucketKey);
    seenKeys.add(geoBucket);
    deduped.push(place);
    if (deduped.length >= 10) break;
  }

  return {
    query: trimmed,
    results: deduped,
  };
}

module.exports = {
  buildHotspotKey,
  serializeHotspotRow,
  detectAndPersistHotspots,
  listSavedHotspots,
  getHotspotsForComplaint,
  getWardAnalytics,
  listActiveCities,
  geocodePlaceQuery,
};
