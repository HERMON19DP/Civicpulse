
import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface SelectedLocation {
  latitude: number;
  longitude: number;
}

interface LocationPickerProps {
  value: SelectedLocation | null;
  onChange: (location: SelectedLocation) => void;
}

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

const markerIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width: 22px;
      height: 22px;
      background: #2563eb;
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function MapClickHandler({
  onChange,
}: {
  onChange: (location: SelectedLocation) => void;
}) {
  useMapEvents({
    click(event) {
      onChange({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

export default function LocationPicker({
  value,
  onChange,
}: LocationPickerProps) {
  const [mapCenter] = useState<[number, number]>(
    value
      ? [value.latitude, value.longitude]
      : DEFAULT_CENTER,
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-white/70">
      <MapContainer
        center={mapCenter}
        zoom={value ? 15 : 5}
        scrollWheelZoom
        style={{ height: "320px", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onChange={onChange} />

        {value && (
          <Marker
            position={[value.latitude, value.longitude]}
            icon={markerIcon}
            draggable
            eventHandlers={{
              dragend(event) {
                const marker = event.target;
                const position = marker.getLatLng();

                onChange({
                  latitude: position.lat,
                  longitude: position.lng,
                });
              },
            }}
          />
        )}
      </MapContainer>

      <div className="bg-white/70 px-3 py-2 text-xs text-ink-soft">
        Click the map to place a pin. Drag the pin to adjust its position.
      </div>
    </div>
  );
}
