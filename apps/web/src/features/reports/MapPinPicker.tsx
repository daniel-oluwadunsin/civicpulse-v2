import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./MapPinPicker.css";

type Coordinates = { latitude: number; longitude: number };

function PinEvents({ onPick }: { onPick: (coordinates: Coordinates) => void }) {
  useMapEvents({
    click(event) {
      onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

export function MapPinPicker({
  value,
  onPick,
}: {
  value: Coordinates | undefined;
  onPick: (coordinates: Coordinates) => void;
}) {
  const center: [number, number] = value
    ? [value.latitude, value.longitude]
    : [9.082, 8.6753];
  const key = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;
  const tiles = key
    ? `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${key}`
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  return (
    <div
      className="map-picker"
      aria-label="Select the report location on a map"
    >
      <MapContainer
        center={center}
        zoom={value ? 16 : 6}
        scrollWheelZoom
        className="map-picker__map"
      >
        <TileLayer
          attribution={
            key
              ? "© OpenStreetMap contributors © Geoapify"
              : "© OpenStreetMap contributors"
          }
          url={tiles}
        />
        <PinEvents onPick={onPick} />
        {value && <Marker position={center} />}
      </MapContainer>
      <p>
        Click the map to place and adjust the pin. Map tiles use Geoapify when
        configured.
      </p>
    </div>
  );
}
