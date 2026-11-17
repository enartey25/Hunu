import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from './tiles';

export interface PinPoint {
  latitude: number;
  longitude: number;
}

interface PinPickerProps {
  /** Where the map opens: the shop already known, or the buyer. */
  center: PinPoint;
  /** The pin, once dropped. */
  value?: PinPoint;
  onChange: (point: PinPoint) => void;
  /** Accessible name for the map. */
  label: string;
}

const pinIcon = () =>
  L.divIcon({
    className: '',
    html: '<span class="map-pin is-drop"><span></span></span>',
    iconSize: [30, 30],
    iconAnchor: [15, 30]
  });

/** A small map where the buyer taps to drop a pin, then drags it to the exact spot. */
export const PinPicker: React.FC<PinPickerProps> = ({ center, value, onChange, label }) => {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    if (!holder.current || map.current) return;
    const start = value || center;
    const m = L.map(holder.current).setView([start.latitude, start.longitude], value ? 17 : 15);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM }).addTo(m);

    const place = (latlng: L.LatLng) => {
      if (!marker.current) {
        marker.current = L.marker(latlng, { icon: pinIcon(), draggable: true, title: 'The shop' }).addTo(m);
        marker.current.on('dragend', () => {
          const p = marker.current!.getLatLng();
          changeRef.current({ latitude: p.lat, longitude: p.lng });
        });
      } else {
        marker.current.setLatLng(latlng);
      }
      changeRef.current({ latitude: latlng.lat, longitude: latlng.lng });
    };
    if (value) {
      marker.current = L.marker([value.latitude, value.longitude], { icon: pinIcon(), draggable: true, title: 'The shop' }).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng();
        changeRef.current({ latitude: p.lat, longitude: p.lng });
      });
    }
    m.on('click', (e: L.LeafletMouseEvent) => place(e.latlng));
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(holder.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div ref={holder} className="map-holder map-holder-pick" role="application" aria-label={label} />
      <p className="t-mute text-xs mt-1" role="status">
        {value
          ? `Pinned at ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}. Drag the pin to adjust.`
          : 'Tap the map where the shop is.'}
      </p>
    </div>
  );
};
