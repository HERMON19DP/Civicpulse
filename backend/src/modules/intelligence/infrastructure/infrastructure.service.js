const infrastructureRepository = require("../../../repositories/infrastructure.repository");
const graphBuilder = require("../graph/graph-builder.service");
const {
  haversineMeters,
  resolveWardAndZone,
} = require("../spatial/ward.resolver");
const {
  ASSET_CATEGORY_RULES,
  CLOSED_STATUSES,
  deriveHealthGrade,
  evaluateComplaintAssetMatch,
  computeAssetHealthScore,
} = require("./health-score.calculator");
const {
  resolveAdministrativeArea,
} = require("../spatial/administrative-geography.service");

function serializeAsset(row) {
  const rule = ASSET_CATEGORY_RULES[row.asset_type] || {};
  const breakdown =
    row.score_breakdown && typeof row.score_breakdown === "object"
      ? row.score_breakdown
      : {};
  const nowMs = Date.now();
  const refDate = row.last_maintained_at || row.install_date || null;
  const maintenanceAgeMonths = refDate
    ? Math.max(
        0,
        Math.round(
          ((nowMs - new Date(refDate).getTime()) / (30 * 24 * 60 * 60 * 1000)) *
            10,
        ) / 10,
      )
    : (breakdown?.factors?.maintenanceAgeMonths ?? null);

  return {
    id: row.id,
    assetCode: row.asset_code,
    name: row.name,
    assetType: row.asset_type,
    assetTypeLabel: rule.label || row.asset_type,
    city: row.city || null,
    ward: row.ward || null,
    zone: row.zone || null,
    address: row.address || null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    catchmentRadiusMeters: Number(row.catchment_radius_meters || 250),
    department: row.department,
    installDate: row.install_date || null,
    lastMaintainedAt: row.last_maintained_at || null,
    maintenanceAgeMonths,
    healthScore: Number(row.health_score ?? 100),
    healthGrade:
      row.health_grade || deriveHealthGrade(Number(row.health_score ?? 100)),
    trend: row.trend || "STABLE",
    complaintCount: Number(row.complaint_count || 0),
    openComplaintCount: Number(row.open_complaint_count || 0),
    recurrenceCount: Number(row.recurrence_count || 0),
    maintenanceEventCount:
      row.maintenance_event_count != null
        ? Number(row.maintenance_event_count)
        : undefined,
    scoreBreakdown: breakdown,
    lastScoredAt: row.last_scored_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Present when queried for a single complaint
    ...(row.link_type
      ? {
          linkType: row.link_type,
          linkConfidence:
            row.link_confidence != null ? Number(row.link_confidence) : null,
          linkReason: row.link_reason || null,
          distanceMeters:
            row.distance_meters != null ? Number(row.distance_meters) : null,
        }
      : {}),
  };
}

function serializeMaintenanceEvent(ev) {
  return {
    id: ev.id,
    assetId: ev.asset_id,
    eventType: ev.event_type,
    outcome: ev.outcome,
    performedBy:
      ev.performed_by || ev.actor_name || "Municipal Engineering Team",
    actorId: ev.actor_id || null,
    notes: ev.notes || null,
    performedAt: ev.performed_at,
    createdAt: ev.created_at,
  };
}

async function scoreSingleAsset(
  assetRow,
  allComplaints,
  { forceSnapshot = false } = {},
) {
  const autoLinks = [];

  for (const complaint of allComplaints) {
    const dist =
      assetRow.latitude != null &&
      assetRow.longitude != null &&
      complaint.latitude != null &&
      complaint.longitude != null
        ? haversineMeters(
            assetRow.latitude,
            assetRow.longitude,
            complaint.latitude,
            complaint.longitude,
          )
        : null;

    const match = evaluateComplaintAssetMatch(assetRow, complaint, dist);
    if (match) {
      autoLinks.push({
        complaintId: complaint.id,
        distanceMeters: match.distanceMeters,
        linkType: match.linkType,
        confidence: match.confidence,
        reason: match.reason,
      });
    }
  }

  await infrastructureRepository.replaceAutoComplaintLinks(
    assetRow.id,
    autoLinks,
  );

  const [linkedComplaints, maintenanceEvents, historyRows] = await Promise.all([
    infrastructureRepository.fetchLinkedComplaintsForAsset(assetRow.id),
    infrastructureRepository.fetchMaintenanceEvents(assetRow.id),
    typeof infrastructureRepository.fetchHealthHistory === "function"
      ? infrastructureRepository
          .fetchHealthHistory(assetRow.id, 12)
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const inActiveHotspot = linkedComplaints.some((c) =>
    Boolean(c.in_active_hotspot),
  );
  const currentScore = assetRow.last_scored_at
    ? Number(assetRow.health_score)
    : null;
  const nowMs = Date.now();
  const maxTrendWindowMs = 45 * 24 * 60 * 60 * 1000;

  // Prefer the most recent meaningfully distinct snapshot within 45 days so idempotent
  // recomputations preserve genuine improving / deteriorating trajectories.
  const distinctPrior = (historyRows || []).find((h) => {
    const recMs = h.recorded_at ? new Date(h.recorded_at).getTime() : NaN;
    if (Number.isFinite(recMs) && nowMs - recMs > maxTrendWindowMs) {
      return false;
    }
    if (currentScore === null) return true;
    return Math.abs(Number(h.health_score) - currentScore) >= 3;
  });

  const previousScore = distinctPrior
    ? Number(distinctPrior.health_score)
    : currentScore;

  const computed = computeAssetHealthScore({
    asset: assetRow,
    linkedComplaints,
    maintenanceEvents,
    inActiveHotspot,
    previousScore,
  });

  const latestSnapshot = historyRows?.[0] || null;
  const latestSnapshotAgeMs = latestSnapshot?.recorded_at
    ? nowMs - new Date(latestSnapshot.recorded_at).getTime()
    : Infinity;
  const scoreChanged =
    currentScore === null || Math.abs(computed.healthScore - currentScore) >= 1;
  const shouldRecordSnapshot =
    !assetRow.last_scored_at ||
    scoreChanged ||
    (forceSnapshot &&
      (!latestSnapshot ||
        Number(latestSnapshot.health_score) !== computed.healthScore ||
        latestSnapshotAgeMs > 60 * 60 * 1000));

  const updated = await infrastructureRepository.updateAssetHealthScore(
    assetRow.id,
    {
      healthScore: computed.healthScore,
      healthGrade: computed.healthGrade,
      trend: computed.trend,
      complaintCount: computed.complaintCount,
      openComplaintCount: computed.openComplaintCount,
      recurrenceCount: computed.recurrenceCount,
      scoreBreakdown: computed.scoreBreakdown,
      recordSnapshot: shouldRecordSnapshot,
    },
  );

  return serializeAsset(updated || assetRow);
}

async function recalculateInfrastructureHealth({
  city = null,
  forceSnapshot = false,
  skipGraphSync = false,
} = {}) {
  const assets = await infrastructureRepository.listAssets({
    city: city && city !== "all" ? city : null,
    limit: 250,
  });

  if (assets.length === 0) {
    return {
      recomputedCount: 0,
      city: city && city !== "all" ? city : null,
      assets: [],
    };
  }

  const allComplaints =
    await infrastructureRepository.fetchAllScorableComplaints({
      city: city && city !== "all" ? city : null,
    });

  const updatedAssets = [];
  for (const asset of assets) {
    const scored = await scoreSingleAsset(asset, allComplaints, {
      forceSnapshot,
    });
    updatedAssets.push(scored);
  }

  if (!skipGraphSync && process.env.NODE_ENV !== "test") {
    graphBuilder
      .syncKnowledgeGraph({ city: city && city !== "all" ? city : null })
      .catch(() => {});
  }

  return {
    recomputedCount: updatedAssets.length,
    city: city && city !== "all" ? city : null,
    assets: updatedAssets.sort((a, b) => a.healthScore - b.healthScore),
  };
}

async function getWardHealthSummary({ city = null } = {}) {
  const { assets, complaints } =
    await infrastructureRepository.queryWardHealthInputs({
      city: city && city !== "all" ? city : null,
    });

  const wardMap = new Map();

  function ensureWardEntry(cityName, wardName, zoneName) {
    const cleanCity = cityName || "General Jurisdiction";
    const cleanWard = wardName || "Unassigned Ward";
    const key = `${cleanCity.toLowerCase()}::${cleanWard.toLowerCase()}`;

    if (!wardMap.has(key)) {
      wardMap.set(key, {
        city: cleanCity,
        ward: cleanWard,
        zone: zoneName || "General Jurisdiction",
        assets: [],
        totalComplaints: 0,
        openComplaints: 0,
        highOrCriticalCount: 0,
      });
    }
    return wardMap.get(key);
  }

  for (const a of assets) {
    const entry = ensureWardEntry(a.city, a.ward, a.zone);
    entry.assets.push(a);
  }

  for (const c of complaints) {
    const entry = ensureWardEntry(c.city, c.ward, c.zone);
    entry.totalComplaints += 1;
    const statusUpper = String(c.status || "").toUpperCase();
    if (!CLOSED_STATUSES.has(statusUpper)) {
      entry.openComplaints += 1;
    }
    const prioUpper = String(c.effective_priority || "").toUpperCase();
    if (prioUpper === "HIGH" || prioUpper === "CRITICAL") {
      entry.highOrCriticalCount += 1;
    }
  }

  const wards = Array.from(wardMap.values()).map((entry) => {
    const assetCount = entry.assets.length;
    const scores = entry.assets.map((a) => Number(a.health_score ?? 100));
    let wardHealthScore = 100;
    let worstAsset = null;

    if (assetCount > 0) {
      const avgScore = scores.reduce((s, v) => s + v, 0) / assetCount;
      const minScore = Math.min(...scores);
      wardHealthScore = Math.round(0.75 * avgScore + 0.25 * minScore);
      worstAsset = entry.assets.reduce((lowest, curr) =>
        Number(curr.health_score) < Number(lowest.health_score) ? curr : lowest,
      );
    } else {
      const syntheticPenalty = Math.min(
        68,
        entry.openComplaints * 7 + entry.highOrCriticalCount * 5,
      );
      wardHealthScore = Math.max(25, Math.round(100 - syntheticPenalty));
    }

    const deterioratingCount = entry.assets.filter(
      (a) => a.trend === "DETERIORATING",
    ).length;
    const criticalOrPoorAssets = entry.assets.filter((a) =>
      ["CRITICAL", "POOR"].includes(String(a.health_grade || "").toUpperCase()),
    ).length;

    return {
      city: entry.city,
      ward: entry.ward,
      zone: entry.zone,
      healthScore: wardHealthScore,
      healthGrade: deriveHealthGrade(wardHealthScore),
      assetCount,
      criticalOrPoorAssets,
      deterioratingCount,
      totalComplaints: entry.totalComplaints,
      openComplaints: entry.openComplaints,
      highOrCriticalCount: entry.highOrCriticalCount,
      worstAsset: worstAsset
        ? {
            id: worstAsset.id,
            assetCode: worstAsset.asset_code,
            name: worstAsset.name,
            assetType: worstAsset.asset_type,
            healthScore: Number(worstAsset.health_score),
            healthGrade: worstAsset.health_grade,
          }
        : null,
    };
  });

  wards.sort(
    (a, b) =>
      a.healthScore - b.healthScore || b.openComplaints - a.openComplaints,
  );

  return {
    city: city && city !== "all" ? city : null,
    totalWards: wards.length,
    wards,
  };
}

async function getInfrastructureOverview({
  city = null,
  ward = null,
  assetType = null,
  grade = null,
  sortBy = "lowest_health",
  limit = 100,
} = {}) {
  let assets = await infrastructureRepository.listAssets({
    city,
    ward,
    assetType,
    grade,
    sortBy,
    limit,
  });

  if (assets.some((a) => !a.last_scored_at)) {
    await recalculateInfrastructureHealth({
      city: city && city !== "all" ? city : null,
    });
    assets = await infrastructureRepository.listAssets({
      city,
      ward,
      assetType,
      grade,
      sortBy,
      limit,
    });
  }

  const serializedAssets = assets.map(serializeAsset);
  const wardSummary = await getWardHealthSummary({ city });

  const totalAssets = serializedAssets.length;
  const avgHealthScore =
    totalAssets > 0
      ? Math.round(
          serializedAssets.reduce((sum, a) => sum + a.healthScore, 0) /
            totalAssets,
        )
      : null;

  const gradeCounts = {
    CRITICAL: serializedAssets.filter((a) => a.healthGrade === "CRITICAL")
      .length,
    POOR: serializedAssets.filter((a) => a.healthGrade === "POOR").length,
    FAIR: serializedAssets.filter((a) => a.healthGrade === "FAIR").length,
    GOOD: serializedAssets.filter((a) => a.healthGrade === "GOOD").length,
  };

  const maintenanceOverdueCount = serializedAssets.filter(
    (a) => (a.maintenanceAgeMonths ?? 0) >= 6,
  ).length;

  const totalLinkedComplaints = serializedAssets.reduce(
    (sum, a) => sum + a.openComplaintCount,
    0,
  );

  return {
    filters: {
      city: city && city !== "all" ? city : null,
      ward: ward && ward !== "all" ? ward : null,
      assetType: assetType && assetType !== "all" ? assetType : null,
      grade: grade && grade !== "all" ? grade : null,
    },
    summary: {
      totalAssets,
      avgHealthScore,
      avgHealthGrade:
        avgHealthScore != null ? deriveHealthGrade(avgHealthScore) : "GOOD",
      gradeCounts,
      openLinkedComplaints: totalLinkedComplaints,
      maintenanceOverdueCount,
      deterioratingCount: serializedAssets.filter(
        (a) => a.trend === "DETERIORATING",
      ).length,
    },
    formula: {
      expression:
        "Health Score = 100 - (Complaint Impact + Recurrence & Overlap + Severity + Unresolved Duration + Maintenance Age)",
      weights: {
        complaintImpactMax: 28,
        recurrenceMax: 22,
        severityMax: 20,
        unresolvedDurationMax: 15,
        maintenanceAgeMax: 15,
      },
    },
    assets: serializedAssets,
    wards: wardSummary.wards,
  };
}

async function getAssetDetails(assetId) {
  const asset = await infrastructureRepository.findAssetById(assetId);
  if (!asset) {
    const error = new Error("Infrastructure asset not found");
    error.statusCode = 404;
    error.code = "ASSET_NOT_FOUND";
    throw error;
  }

  let currentAsset = asset;
  if (!currentAsset.last_scored_at) {
    const allComplaints =
      await infrastructureRepository.fetchAllScorableComplaints({
        city: currentAsset.city,
      });
    await scoreSingleAsset(currentAsset, allComplaints);
    currentAsset =
      (await infrastructureRepository.findAssetById(assetId)) || currentAsset;
  }

  const [linkedRows, maintenanceRows, historyRows] = await Promise.all([
    infrastructureRepository.fetchLinkedComplaintsForAsset(assetId),
    infrastructureRepository.fetchMaintenanceEvents(assetId),
    infrastructureRepository.fetchHealthHistory(assetId, 12),
  ]);

  return {
    asset: serializeAsset(currentAsset),
    linkedComplaints: linkedRows.map((c) => ({
      id: c.id,
      referenceId: c.reference_id,
      title: c.title,
      category: c.canonical_category || c.category,
      priority: c.effective_priority || c.priority,
      status: c.status,
      city: c.city,
      ward: c.ward,
      address: c.address,
      linkType: c.link_type,
      linkConfidence:
        c.link_confidence != null ? Number(c.link_confidence) : null,
      linkReason: c.link_reason || null,
      distanceMeters:
        c.distance_meters != null ? Number(c.distance_meters) : null,
      upvoteCount: Number(c.upvote_count || 0),
      createdAt: c.created_at,
    })),
    maintenanceEvents: maintenanceRows.map(serializeMaintenanceEvent),
    healthHistory: historyRows.map((h) => ({
      id: h.id,
      healthScore: Number(h.health_score),
      healthGrade: h.health_grade,
      complaintCount: Number(h.complaint_count),
      openComplaintCount: Number(h.open_complaint_count),
      recordedAt: h.recorded_at,
    })),
  };
}

async function registerAsset(payload) {
  const existing = await infrastructureRepository.findAssetByCode(
    payload.assetCode,
  );
  if (existing) {
    const error = new Error(`Asset code "${payload.assetCode}" already exists`);
    error.statusCode = 409;
    error.code = "ASSET_CODE_EXISTS";
    throw error;
  }

  const administrativeArea = await resolveAdministrativeArea({
    latitude: payload.latitude,
    longitude: payload.longitude,
  });

  const fallbackGeo = administrativeArea
    ? null
    : resolveWardAndZone({
        latitude: payload.latitude,
        longitude: payload.longitude,
        address:
          payload.address || `${payload.ward || ""} ${payload.city || ""}`,
      });

  const rule = ASSET_CATEGORY_RULES[payload.assetType] || {};
  const created = await infrastructureRepository.createAsset({
    assetCode: payload.assetCode.toUpperCase(),
    name: payload.name,
    assetType: payload.assetType,

    city: administrativeArea?.city || payload.city || fallbackGeo?.city,
    ward: administrativeArea?.ward || payload.ward || fallbackGeo?.ward,
    zone: administrativeArea?.zone || payload.zone || fallbackGeo?.zone,

    administrativeWardId: administrativeArea?.wardId || null,
    administrativeZoneId: administrativeArea?.zoneId || null,
    administrativeBoundaryVersionId:
      administrativeArea?.boundaryVersionId || null,

    address: payload.address || null,
    latitude: payload.latitude,
    longitude: payload.longitude,
    catchmentRadiusMeters: payload.catchmentRadiusMeters ?? 250,
    department:
      payload.department || rule.defaultDepartment || "Municipal Engineering",
    installDate: payload.installDate || null,
    lastMaintainedAt: payload.lastMaintainedAt || null,
    metadata: { createdVia: "officer-console" },
  });

  const allComplaints =
    await infrastructureRepository.fetchAllScorableComplaints({
      city: created.city,
    });
  await scoreSingleAsset(created, allComplaints, { forceSnapshot: true });

  if (process.env.NODE_ENV !== "test") {
    graphBuilder
      .syncKnowledgeGraph({ city: created.city || null })
      .catch(() => {});
  }

  return getAssetDetails(created.id);
}

async function recordMaintenanceForAsset(assetId, payload, actor = null) {
  const asset = await infrastructureRepository.findAssetById(assetId);
  if (!asset) {
    const error = new Error("Infrastructure asset not found");
    error.statusCode = 404;
    error.code = "ASSET_NOT_FOUND";
    throw error;
  }

  const eventRow = await infrastructureRepository.createMaintenanceEvent({
    assetId,
    eventType: payload.eventType,
    outcome: payload.outcome || "COMPLETED",
    performedBy: payload.performedBy || actor?.name || "Municipal Field Crew",
    actorId: actor?.id || null,
    notes: payload.notes || null,
    performedAt: payload.performedAt || null,
  });

  const refreshedAsset = await infrastructureRepository.findAssetById(assetId);
  const allComplaints =
    await infrastructureRepository.fetchAllScorableComplaints({
      city: refreshedAsset.city,
    });
  await scoreSingleAsset(refreshedAsset, allComplaints, {
    forceSnapshot: true,
  });

  if (process.env.NODE_ENV !== "test") {
    graphBuilder
      .syncKnowledgeGraph({ city: refreshedAsset.city || null })
      .catch(() => {});
  }

  const details = await getAssetDetails(assetId);
  return {
    event: serializeMaintenanceEvent(eventRow),
    ...details,
  };
}

async function getAssetsForComplaint(complaintId) {
  if (typeof infrastructureRepository.findAssetsForComplaint !== "function") {
    return [];
  }
  const rows =
    await infrastructureRepository.findAssetsForComplaint(complaintId);
  return rows.map(serializeAsset);
}

async function getInfrastructureMetrics({ city = null } = {}) {
  let assets = await infrastructureRepository.listAssets({
    city: city && city !== "all" ? city : null,
    limit: 250,
  });

  if (assets.some((a) => !a.last_scored_at)) {
    await recalculateInfrastructureHealth({
      city: city && city !== "all" ? city : null,
    });
    assets = await infrastructureRepository.listAssets({
      city: city && city !== "all" ? city : null,
      limit: 250,
    });
  }

  const serialized = assets.map(serializeAsset);
  const count = serialized.length;

  const round2 = (n) => Math.round(n * 100) / 100;

  if (count === 0) {
    return {
      city: city && city !== "all" ? city : null,
      totalAssets: 0,
      avgHealthScore: null,
      gradeDistribution: { GOOD: 0, FAIR: 0, POOR: 0, CRITICAL: 0 },
      trendDistribution: { IMPROVING: 0, STABLE: 0, DETERIORATING: 0 },
      averagePenalties: {
        complaintImpactPenalty: 0,
        recurrencePenalty: 0,
        severityPenalty: 0,
        unresolvedDurationPenalty: 0,
        maintenanceAgePenalty: 0,
        totalPenalty: 0,
      },
      labelAlignment: {
        overdueMaintenanceCount: 0,
        overdueSubHealthyCount: 0,
        maintenanceAlignmentPercent: null,
        poorOrCriticalCount: 0,
        poorOrCriticalOverdueCount: 0,
        crossImpactExposedAssets: 0,
      },
      sensitivityAnalysis: {
        baselineAvgHealth: null,
        whatIfResolveAllOpenAvgHealth: null,
        deltaResolveOpenPts: 0,
        whatIfCompleteMaintenanceAvgHealth: null,
        deltaCompleteMaintenancePts: 0,
        whatIfEliminateOverlapAvgHealth: null,
        deltaEliminateOverlapPts: 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  const gradeDistribution = { GOOD: 0, FAIR: 0, POOR: 0, CRITICAL: 0 };
  const trendDistribution = { IMPROVING: 0, STABLE: 0, DETERIORATING: 0 };

  let sumScore = 0;
  let sumComplaintPenalty = 0;
  let sumRecurrencePenalty = 0;
  let sumSeverityPenalty = 0;
  let sumDurationPenalty = 0;
  let sumMaintPenalty = 0;
  let sumTotalPenalty = 0;

  let overdueMaintenanceCount = 0;
  let overdueSubHealthyCount = 0;
  let poorOrCriticalCount = 0;
  let poorOrCriticalOverdueCount = 0;
  let crossImpactExposedAssets = 0;

  let sumResolveOpenScore = 0;
  let sumCompleteMaintScore = 0;
  let sumRemoveOverlapScore = 0;

  for (const asset of serialized) {
    const b = asset.scoreBreakdown || {};
    const cPen = Number(b.complaintImpactPenalty ?? 0);
    const rPen = Number(b.recurrencePenalty ?? 0);
    const sPen = Number(b.severityPenalty ?? 0);
    const dPen = Number(b.unresolvedDurationPenalty ?? 0);
    const mPen = Number(b.maintenanceAgePenalty ?? 0);
    const totPen = Number(
      b.totalPenalty ?? Math.max(0, 100 - asset.healthScore),
    );

    gradeDistribution[asset.healthGrade] =
      (gradeDistribution[asset.healthGrade] || 0) + 1;
    trendDistribution[asset.trend] = (trendDistribution[asset.trend] || 0) + 1;

    sumScore += asset.healthScore;
    sumComplaintPenalty += cPen;
    sumRecurrencePenalty += rPen;
    sumSeverityPenalty += sPen;
    sumDurationPenalty += dPen;
    sumMaintPenalty += mPen;
    sumTotalPenalty += totPen;

    const isOverdue = (asset.maintenanceAgeMonths ?? 0) >= 6;
    if (isOverdue) {
      overdueMaintenanceCount += 1;
      if (asset.healthScore < 80) {
        overdueSubHealthyCount += 1;
      }
    }
    if (asset.healthGrade === "POOR" || asset.healthGrade === "CRITICAL") {
      poorOrCriticalCount += 1;
      if (isOverdue) {
        poorOrCriticalOverdueCount += 1;
      }
    }
    if ((b.factors?.crossImpactCount ?? 0) > 0) {
      crossImpactExposedAssets += 1;
    }

    // What-if perturbations over the deterministic penalty model
    const ifResolvedPenalty =
      mPen + Math.min(4, Number(b.factors?.resolvedActiveCount ?? 0) * 1.0);
    sumResolveOpenScore += Math.max(
      0,
      Math.min(100, Math.round(100 - ifResolvedPenalty)),
    );

    const ifMaintainedPenalty = Math.max(0, totPen - mPen);
    sumCompleteMaintScore += Math.max(
      0,
      Math.min(100, Math.round(100 - ifMaintainedPenalty)),
    );

    const crossCount = Number(b.factors?.crossImpactCount ?? 0);
    const hotspotPenaltyApprox = b.factors?.inActiveHotspot ? 3.5 : 0;
    const estimatedOverlapRelief = Math.min(
      rPen,
      crossCount * 3.5 + hotspotPenaltyApprox,
    );
    const ifNoOverlapPenalty = Math.max(0, totPen - estimatedOverlapRelief);
    sumRemoveOverlapScore += Math.max(
      0,
      Math.min(100, Math.round(100 - ifNoOverlapPenalty)),
    );
  }

  const baselineAvgHealth = round2(sumScore / count);
  const whatIfResolveAllOpenAvgHealth = round2(sumResolveOpenScore / count);
  const whatIfCompleteMaintenanceAvgHealth = round2(
    sumCompleteMaintScore / count,
  );
  const whatIfEliminateOverlapAvgHealth = round2(sumRemoveOverlapScore / count);

  return {
    city: city && city !== "all" ? city : null,
    totalAssets: count,
    avgHealthScore: Math.round(baselineAvgHealth),
    gradeDistribution,
    trendDistribution,
    averagePenalties: {
      complaintImpactPenalty: round2(sumComplaintPenalty / count),
      recurrencePenalty: round2(sumRecurrencePenalty / count),
      severityPenalty: round2(sumSeverityPenalty / count),
      unresolvedDurationPenalty: round2(sumDurationPenalty / count),
      maintenanceAgePenalty: round2(sumMaintPenalty / count),
      totalPenalty: round2(sumTotalPenalty / count),
    },
    labelAlignment: {
      overdueMaintenanceCount,
      overdueSubHealthyCount,
      maintenanceAlignmentPercent:
        overdueMaintenanceCount > 0
          ? Math.round((overdueSubHealthyCount / overdueMaintenanceCount) * 100)
          : 100,
      poorOrCriticalCount,
      poorOrCriticalOverdueCount,
      crossImpactExposedAssets,
    },
    sensitivityAnalysis: {
      baselineAvgHealth,
      whatIfResolveAllOpenAvgHealth,
      deltaResolveOpenPts: round2(
        whatIfResolveAllOpenAvgHealth - baselineAvgHealth,
      ),
      whatIfCompleteMaintenanceAvgHealth,
      deltaCompleteMaintenancePts: round2(
        whatIfCompleteMaintenanceAvgHealth - baselineAvgHealth,
      ),
      whatIfEliminateOverlapAvgHealth,
      deltaEliminateOverlapPts: round2(
        whatIfEliminateOverlapAvgHealth - baselineAvgHealth,
      ),
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  serializeAsset,
  serializeMaintenanceEvent,
  scoreSingleAsset,
  recalculateInfrastructureHealth,
  getWardHealthSummary,
  getInfrastructureOverview,
  getAssetDetails,
  registerAsset,
  recordMaintenanceForAsset,
  getAssetsForComplaint,
  getInfrastructureMetrics,
};
