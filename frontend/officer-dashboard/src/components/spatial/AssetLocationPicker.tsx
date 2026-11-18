import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface PickedLocation {
  latitude: number;
  longitude: number;
}

interface AssetLocationPickerProps {
  /** Current marker position; null means no location selected yet */
  pickedLocation: PickedLocation | null;
  /** Default centre to show when no location is selected */
  defaultCenter: PickedLocation;
  onLocationPick: (loc: PickedLocation) => void;
}

/** Creates the same blue teardrop pin used in SpatialMap */
function createPickerPinIcon() {
  return L.divIcon({
    className: "asset-picker-pin",
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

/** Inner component: handles map clicks */
function ClickHandler({
  onLocationPick,
}: {
  onLocationPick: (loc: PickedLocation) => void;
}) {
  useMapEvents({
    click(event) {
      onLocationPick({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });
  return null;
}

/** Inner component: keeps the view centred on the first pick */
function InitialViewSetter({
  pickedLocation,
  defaultCenter,
}: {
  pickedLocation: PickedLocation | null;
  defaultCenter: PickedLocation;
}) {
  const map = useMap();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      const target = pickedLocation ?? defaultCenter;
      map.setView([target.latitude, target.longitude], 13);
      initialized.current = true;
    }
  }, [map, pickedLocation, defaultCenter]);

  return null;
}

export default function AssetLocationPicker({
  pickedLocation,
  defaultCenter,
  onLocationPick,
}: AssetLocationPickerProps) {
  const pinIcon = useMemo(() => createPickerPinIcon(), []);

  const mapCenter: [number, number] = [
    defaultCenter.latitude,
    defaultCenter.longitude,
  ];

  return (
    <div className="h-[280px] w-full overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm">
      <MapContainer
        center={mapCenter}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full cursor-crosshair"
        // Prevent the map from capturing scroll when inside a modal
        style={{ cursor: "crosshair" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <InitialViewSetter
          pickedLocation={pickedLocation}
          defaultCenter={defaultCenter}
        />

        <ClickHandler onLocationPick={onLocationPick} />

        {pickedLocation && (
          <Marker
            position={[pickedLocation.latitude, pickedLocation.longitude]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend(event) {
                const marker = event.target as L.Marker;
                const pos = marker.getLatLng();
                onLocationPick({
                  latitude: Number(pos.lat.toFixed(6)),
                  longitude: Number(pos.lng.toFixed(6)),
                });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
