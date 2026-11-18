import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { PersistedHotspot, SpatialComplaint } from "../../types/spatial";

interface SpatialMapProps {
  center: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  showSearchCircle?: boolean;
  enableLocationPicker?: boolean;
  complaints: SpatialComplaint[];
  selectedComplaintId?: string | null;
  onComplaintSelect?: (complaintId: string) => void;
  hotspots?: PersistedHotspot[];
  wardMarkers?: Array<{
    city?: string | null;
    ward: string;
    zone: string;
    totalComplaints: number;
    openComplaints: number;
    densityPerSqKm: number;
    activeHotspots: number;
    overlapHotspots: number;
    center: { latitude: number; longitude: number };
  }>;
  focusedLocation?: {
    latitude: number;
    longitude: number;
    hotspotId?: string | null;
    label?: string | null;
  } | null;
  onCenterSelect?: (coords: { latitude: number; longitude: number }) => void;
}

function MapBounds({
  positions,
  center,
  includeCenterInBounds,
  enableLocationPicker,
  focusedLocation,
  selectedComplaint,
}: {
  positions: [number, number][];
  center: [number, number];
  includeCenterInBounds: boolean;
  enableLocationPicker: boolean;
  focusedLocation?: {
    latitude: number;
    longitude: number;
    hotspotId?: string | null;
    label?: string | null;
  } | null;
  selectedComplaint?: SpatialComplaint | null;
}) {
  const map = useMap();
  const hasInitializedPicker = useRef(false);

  const boundsSignature = useMemo(
    () =>
      JSON.stringify({
        positions,
        includeCenterInBounds,
        enableLocationPicker,
        focusedLocation: focusedLocation
          ? {
              lat: focusedLocation.latitude,
              lng: focusedLocation.longitude,
              hotspotId: focusedLocation.hotspotId ?? null,
            }
          : null,
        selectedComplaintId: selectedComplaint?.id ?? null,
      }),
    [
      positions,
      includeCenterInBounds,
      enableLocationPicker,
      focusedLocation,
      selectedComplaint?.id,
    ],
  );

  // Pan smoothly to a selected complaint from the Nearby results list
  useEffect(() => {
    if (
      selectedComplaint &&
      Number.isFinite(selectedComplaint.latitude) &&
      Number.isFinite(selectedComplaint.longitude)
    ) {
      map.setView(
        [selectedComplaint.latitude, selectedComplaint.longitude],
        Math.max(map.getZoom(), 15),
        { animate: true },
      );
    }
  }, [map, selectedComplaint]);

  useEffect(() => {
    if (selectedComplaint) {
      return;
    }

    if (
      focusedLocation &&
      Number.isFinite(focusedLocation.latitude) &&
      Number.isFinite(focusedLocation.longitude)
    ) {
      map.setView([focusedLocation.latitude, focusedLocation.longitude], 15, {
        animate: true,
      });
      return;
    }

    if (enableLocationPicker) {
      if (positions.length > 0) {
        const pts = includeCenterInBounds ? [center, ...positions] : positions;
        const bounds = L.latLngBounds(pts);
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
      } else if (!hasInitializedPicker.current) {
        map.setView(center, 13);
        hasInitializedPicker.current = true;
      }
      return;
    }

    hasInitializedPicker.current = false;

    if (positions.length === 0) {
      map.setView(center, 12);
      return;
    }

    const pts = includeCenterInBounds ? [center, ...positions] : positions;
    const bounds = L.latLngBounds(pts);

    map.fitBounds(bounds, {
      padding: [42, 42],
      maxZoom: 16,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, boundsSignature]);

  return null;
}

function MapClickCenterSelector({
  onCenterSelect,
}: {
  onCenterSelect?: (coords: { latitude: number; longitude: number }) => void;
}) {
  useMapEvents({
    click(event) {
      if (!onCenterSelect) return;
      onCenterSelect({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });

  return null;
}

function createPickerPinIcon() {
  return L.divIcon({
    className: "spatial-picker-pin",
    html: `
      <div style="
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: linear-gradient(135deg, #2563eb, #4f46e5);
        border: 3px solid #ffffff;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #ffffff;
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

function createHotspotIcon(
  count: number,
  hasOverlap?: boolean,
  severity?: string,
) {
  const bg =
    severity === "CRITICAL"
      ? "#dc2626"
      : hasOverlap
        ? "#d97706"
        : "#2563eb";
  const ring = hasOverlap ? "0 0 0 4px rgba(245, 158, 11, 0.35)," : "";

  return L.divIcon({
    className: "spatial-cluster-icon",
    html: `
      <div style="
        width: 42px;
        height: 42px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${bg};
        color: white;
        border: 3px solid white;
        box-shadow: ${ring} 0 2px 8px rgba(0,0,0,0.3);
        font-size: 14px;
        font-weight: 800;
      ">
        ${count}
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -21],
  });
}

function createWardIcon(count: number, overlapHotspots: number) {
  const bg = overlapHotspots > 0 ? "#d97706" : "#4f46e5";
  return L.divIcon({
    className: "spatial-ward-icon",
    html: `
      <div style="
        min-width: 38px;
        height: 38px;
        padding: 0 8px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${bg};
        color: white;
        border: 2.5px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.28);
        font-size: 12px;
        font-weight: 800;
      ">
        ${count}
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -19],
  });
}

export default function SpatialMap({
  center,
  radiusMeters,
  showSearchCircle = true,
  enableLocationPicker = false,
  complaints,
  selectedComplaintId = null,
  onComplaintSelect,
  hotspots,
  wardMarkers,
  focusedLocation,
  onCenterSelect,
}: SpatialMapProps) {
  const pickerIcon = useMemo(() => createPickerPinIcon(), []);

  const mapCenter: [number, number] = [center.latitude, center.longitude];

  const isHotspotMode = hotspots !== undefined;
  const isWardMode = wardMarkers !== undefined;

  const selectedComplaint = useMemo(
    () =>
      selectedComplaintId
        ? complaints.find((c) => c.id === selectedComplaintId) ?? null
        : null,
    [complaints, selectedComplaintId],
  );

  const positions: [number, number][] = isWardMode
    ? wardMarkers.map(
        (w) => [w.center.latitude, w.center.longitude] as [number, number],
      )
    : isHotspotMode
      ? hotspots.map(
          (hotspot) =>
            [hotspot.centroid.latitude, hotspot.centroid.longitude] as [
              number,
              number,
            ],
        )
      : complaints.map(
          (complaint) =>
            [complaint.latitude, complaint.longitude] as [number, number],
        );

  return (
    <div className="h-[460px] w-full overflow-hidden rounded-2xl border border-white/60 shadow-ios-glass">
      <MapContainer
        center={mapCenter}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBounds
          positions={positions}
          center={mapCenter}
          includeCenterInBounds={showSearchCircle}
          enableLocationPicker={enableLocationPicker}
          focusedLocation={focusedLocation}
          selectedComplaint={selectedComplaint}
        />
        <MapClickCenterSelector onCenterSelect={onCenterSelect} />

        {focusedLocation && !enableLocationPicker && (
          <CircleMarker
            center={[focusedLocation.latitude, focusedLocation.longitude]}
            radius={14}
            pathOptions={{
              color: "#1d4ed8",
              fillColor: "#3b82f6",
              fillOpacity: 0.24,
              weight: 3,
            }}
          >
            <Popup>
              <div className="space-y-0.5 text-xs">
                <strong className="text-blue-700">Focused Location</strong>
                {focusedLocation.label && (
                  <p className="font-medium">{focusedLocation.label}</p>
                )}
                <p className="font-mono text-[11px] text-slate-600">
                  {focusedLocation.latitude.toFixed(5)},{" "}
                  {focusedLocation.longitude.toFixed(5)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* Search radius circle & interactive draggable pin for Nearby Search */}
        {showSearchCircle && (
          <>
            <Circle
              center={mapCenter}
              radius={Math.max(50, radiusMeters)}
              pathOptions={{
                color: "#4f46e5",
                fillColor: "#6366f1",
                fillOpacity: 0.08,
                weight: 2,
                dashArray: enableLocationPicker ? "6 4" : undefined,
              }}
            />

            {enableLocationPicker ? (
              <Marker
                position={mapCenter}
                icon={pickerIcon}
                draggable
                eventHandlers={{
                  dragend: (event) => {
                    const marker = event.target as L.Marker;
                    const pos = marker.getLatLng();
                    onCenterSelect?.({
                      latitude: Number(pos.lat.toFixed(6)),
                      longitude: Number(pos.lng.toFixed(6)),
                    });
                  },
                }}
              >
                <Popup>
                  <div className="space-y-1 text-xs">
                    <strong className="text-indigo-700">
                      Nearby Search Center
                    </strong>
                    <p className="text-slate-600">
                      Drag pin or click anywhere on the map to adjust location.
                    </p>
                    <p className="font-mono text-[11px] text-slate-700">
                      {center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Radius: {radiusMeters >= 1000 ? `${(radiusMeters / 1000).toFixed(radiusMeters % 1000 === 0 ? 0 : 1)} km` : `${radiusMeters} m`}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ) : (
              <CircleMarker
                center={mapCenter}
                radius={7}
                pathOptions={{
                  color: "#ffffff",
                  fillColor: "#6366f1",
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Popup>Analysis Center</Popup>
              </CircleMarker>
            )}
          </>
        )}

        {/* Nearby complaint markers */}
        {!isHotspotMode &&
          !isWardMode &&
          complaints.map((complaint) => {
            const isSelected = selectedComplaintId === complaint.id;
            return (
              <div key={complaint.id}>
                {isSelected && (
                  <CircleMarker
                    center={[complaint.latitude, complaint.longitude]}
                    radius={16}
                    pathOptions={{
                      color: "#1d4ed8",
                      fillColor: "#3b82f6",
                      fillOpacity: 0.22,
                      weight: 2.5,
                    }}
                  />
                )}
                <CircleMarker
                  center={[complaint.latitude, complaint.longitude]}
                  radius={isSelected ? 10 : 8}
                  pathOptions={{
                    color: "#ffffff",
                    fillColor: isSelected ? "#1d4ed8" : "#ef4444",
                    fillOpacity: 0.95,
                    weight: isSelected ? 3 : 2,
                  }}
                  eventHandlers={{
                    click: () => onComplaintSelect?.(complaint.id),
                  }}
                >
                  <Popup>
                    <div className="min-w-[190px] space-y-1 text-xs">
                      <strong>{complaint.referenceId}</strong>
                      <p className="font-semibold">{complaint.title}</p>
                      {(complaint.city || complaint.ward) && (
                        <p>
                          Location:{" "}
                          {[complaint.ward, complaint.city]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      <p>Category: {complaint.canonicalCategory}</p>
                      <p>Status: {complaint.status}</p>
                      <p>Distance: {complaint.distanceMeters.toFixed(1)} m</p>
                    </div>
                  </Popup>
                </CircleMarker>
              </div>
            );
          })}

        {/* Persisted Hotspot footprints & markers */}
        {isHotspotMode &&
          !isWardMode &&
          hotspots.map((hotspot) => {
            const isCritical = hotspot.severity === "CRITICAL";
            const footprintColor = isCritical
              ? "#dc2626"
              : hotspot.hasCrossCategoryOverlap
                ? "#d97706"
                : "#2563eb";

            return (
              <div key={hotspot.id}>
                <Circle
                  center={[
                    hotspot.centroid.latitude,
                    hotspot.centroid.longitude,
                  ]}
                  radius={Math.max(45, hotspot.radiusMeters || 80)}
                  pathOptions={{
                    color: footprintColor,
                    fillColor: footprintColor,
                    fillOpacity: hotspot.hasCrossCategoryOverlap ? 0.16 : 0.1,
                    weight: hotspot.hasCrossCategoryOverlap ? 2.5 : 1.5,
                  }}
                />

                {hotspot.complaints?.map((member) => (
                  <CircleMarker
                    key={`${hotspot.id}-${member.id}`}
                    center={[member.latitude, member.longitude]}
                    radius={4.5}
                    pathOptions={{
                      color: "#ffffff",
                      fillColor: footprintColor,
                      fillOpacity: 0.9,
                      weight: 1.5,
                    }}
                  >
                    <Popup>
                      <div className="min-w-[170px] space-y-1 text-xs">
                        <strong>{member.referenceId}</strong>
                        <p className="font-semibold">{member.title}</p>
                        <p>Category: {member.canonicalCategory}</p>
                        <p>Status: {member.status}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

                <Marker
                  position={[
                    hotspot.centroid.latitude,
                    hotspot.centroid.longitude,
                  ]}
                  icon={createHotspotIcon(
                    hotspot.complaintCount,
                    hotspot.hasCrossCategoryOverlap,
                    hotspot.severity,
                  )}
                  title={`${hotspot.title || "Complaint Hotspot"} (${hotspot.complaintCount} complaints)`}
                >
                  <Popup>
                    <div className="min-w-[225px] space-y-1.5 text-xs">
                      <strong className="block text-sm">
                        {hotspot.title || "Complaint Hotspot"}
                      </strong>
                      {(hotspot.city || hotspot.ward) && (
                        <p className="text-slate-600">
                          {hotspot.city ? `${hotspot.city} · ` : ""}
                          {hotspot.ward}
                          {hotspot.zone ? ` · ${hotspot.zone}` : ""}
                        </p>
                      )}
                      <p>
                        <strong>{hotspot.complaintCount}</strong> complaints (
                        <strong>{hotspot.openCount ?? 0}</strong> open) ·{" "}
                        <strong>{hotspot.severity || "MEDIUM"}</strong>
                      </p>
                      {hotspot.hasCrossCategoryOverlap &&
                        hotspot.overlapSummary && (
                          <p className="rounded bg-amber-50 p-1.5 text-[11px] font-medium text-amber-900">
                            Overlap: {hotspot.overlapSummary}
                          </p>
                        )}
                      <div>
                        <strong>Categories:</strong>{" "}
                        {Object.entries(hotspot.categoryCounts)
                          .map(
                            ([category, count]) =>
                              `${category.replace(/_/g, " ")} (${count})`,
                          )
                          .join(", ")}
                      </div>
                      <div className="space-y-0.5 border-t pt-1">
                        {hotspot.complaints.slice(0, 5).map((c) => (
                          <p key={c.id} className="truncate">
                            {c.referenceId} — {c.title}
                          </p>
                        ))}
                        {hotspot.complaints.length > 5 && (
                          <p className="text-slate-500">
                            + {hotspot.complaints.length - 5} more
                          </p>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </div>
            );
          })}

        {/* Ward Markers */}
        {isWardMode &&
          wardMarkers.map((wardItem) => (
            <div key={`${wardItem.city || "gen"}-${wardItem.ward}`}>
              <Circle
                center={[wardItem.center.latitude, wardItem.center.longitude]}
                radius={Math.max(
                  180,
                  Math.min(800, wardItem.totalComplaints * 110),
                )}
                pathOptions={{
                  color: wardItem.overlapHotspots > 0 ? "#d97706" : "#4f46e5",
                  fillColor:
                    wardItem.overlapHotspots > 0 ? "#f59e0b" : "#6366f1",
                  fillOpacity: 0.14,
                  weight: 2,
                }}
              />
              <Marker
                position={[
                  wardItem.center.latitude,
                  wardItem.center.longitude,
                ]}
                icon={createWardIcon(
                  wardItem.totalComplaints,
                  wardItem.overlapHotspots,
                )}
                title={wardItem.ward}
              >
                <Popup>
                  <div className="min-w-[190px] space-y-1 text-xs">
                    {wardItem.city && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                        {wardItem.city}
                      </p>
                    )}
                    <strong className="text-sm">{wardItem.ward}</strong>
                    <p className="text-slate-600">{wardItem.zone}</p>
                    <p>
                      Total: <strong>{wardItem.totalComplaints}</strong> · Open:{" "}
                      <strong>{wardItem.openComplaints}</strong>
                    </p>
                    <p>Density: {wardItem.densityPerSqKm} / km²</p>
                    <p>Persisted hotspots: {wardItem.activeHotspots}</p>
                  </div>
                </Popup>
              </Marker>
            </div>
          ))}
      </MapContainer>
    </div>
  );
}
