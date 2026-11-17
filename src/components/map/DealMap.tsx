import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoLocation, ScoredVendorResult } from '../../engine/types';
import { SupportedCurrency } from '../../engine/currency';
import { deliveredText } from '../../engine/deliveryText';
import { isMappable } from '../../engine/shopPins';
import { TILE_ATTRIBUTION, TILE_MAX_ZOOM, TILE_URL } from './tiles';
import { MapPinPlus } from 'lucide-react';

/** More pins than this and the map stops being readable; the closest are kept. */
const MAX_PINS = 30;

interface DealMapProps {
  /** The ranked results, best first. Pins carry each row's rank in this list. */
  results: ScoredVendorResult[];
  home: GeoLocation;
  currency: SupportedCurrency;
  /** Switch to the list with this row opened. */
  onShowInList: (vendorId: string) => void;
  /** Start pinning a shop that is not on the map. */
  onPinShop?: () => void;
  className?: string;
  /** Fill the height of the screen: the website's side-by-side layout. */
  tall?: boolean;
}

interface MappedRow {
  result: ScoredVendorResult;
  rank: number;
}

function pinKind(row: MappedRow): string {
  const v = row.result.vendor;
  const priced = v.priceKnown !== false && v.pricing.baseMonthlyCost > 0;
  return [
    row.rank === 1 ? 'is-lead' : priced ? 'is-priced' : 'is-ask',
    v.dataSource === 'pinned' ? 'is-pinned' : ''
  ].join(' ');
}

function priceLine(row: MappedRow, currency: SupportedCurrency): string {
  const { vendor } = row.result;
  const priced = vendor.priceKnown !== false && vendor.pricing.baseMonthlyCost > 0;
  return priced ? deliveredText(row.result, currency) : 'Ask in store';
}

function kindLine(row: MappedRow): string {
  const v = row.result.vendor;
  switch (v.dataSource) {
    case 'quote':
      return 'Your quote';
    case 'community':
      return 'Price shared by a Hunu user';
    case 'pinned':
      return v.communityShop ? 'Shop pinned by a Hunu user' : 'Shop you pinned';
    case 'local':
      return 'Shop on OpenStreetMap';
    default:
      return 'Seller';
  }
}

/** The popup for a pin, built from DOM nodes: names come from the open web and other users. */
function popupFor(row: MappedRow, currency: SupportedCurrency, onShowInList: (id: string) => void): HTMLElement {
  const { vendor, breakdown } = row.result;
  const el = (tag: string, className: string, text?: string) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const box = el('div', 'map-pop');
  box.append(el('p', 'map-pop-rank t-mute', `#${row.rank} · ${kindLine(row)}`));
  box.append(el('p', 'map-pop-name', vendor.name));
  const facts = [priceLine(row, currency), breakdown.distanceKm !== undefined ? `${breakdown.distanceKm.toLocaleString()} km` : '']
    .filter(Boolean)
    .join(' · ');
  box.append(el('p', 'map-pop-facts fig', facts));

  const actions = el('div', 'map-pop-actions');
  const show = el('button', 'btn', 'Show in list') as HTMLButtonElement;
  show.type = 'button';
  show.addEventListener('click', () => onShowInList(vendor.id));
  const directions = el('a', 'btn', 'Directions') as HTMLAnchorElement;
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${vendor.location.latitude},${vendor.location.longitude}`;
  directions.target = '_blank';
  directions.rel = 'noopener noreferrer';
  actions.append(show, directions);
  box.append(actions);
  return box;
}

/**
 * The ranked results on a map. Only rows with a real place are pinned: shops, quotes,
 * shared prices and pinned shops. Online listings are counted underneath instead.
 */
export const DealMap: React.FC<DealMapProps> = ({ results, home, currency, onShowInList, onPinShop, className = '', tall = false }) => {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // Kept current so the popups' buttons always call the latest handler.
  const showRef = useRef(onShowInList);
  showRef.current = onShowInList;

  const { mapped, offMap } = useMemo(() => {
    const rows = results.map((result, i) => ({ result, rank: i + 1 }));
    const placed = rows.filter((r) => isMappable(r.result.vendor));
    const closest = [...placed]
      .sort((a, b) => (a.result.breakdown.distanceKm ?? 1e9) - (b.result.breakdown.distanceKm ?? 1e9))
      .slice(0, MAX_PINS)
      .sort((a, b) => a.rank - b.rank);
    return { mapped: closest, offMap: rows.length - placed.length };
  }, [results]);

  // The map itself, once.
  useEffect(() => {
    if (!holder.current || map.current) return;
    const m = L.map(holder.current, { zoomControl: true, attributionControl: true }).setView([home.latitude, home.longitude], 13);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // The holder can be sized after the first paint (a panel opening).
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(holder.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The pins, whenever the results change.
  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();

    const me = L.marker([home.latitude, home.longitude], {
      icon: L.divIcon({ className: '', html: '<span class="map-me"></span>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      keyboard: false,
      title: 'You are here'
    });
    group.addLayer(me);

    for (const row of mapped) {
      const v = row.result.vendor;
      const marker = L.marker([v.location.latitude, v.location.longitude], {
        icon: L.divIcon({
          className: '',
          // The rank is a number, so this markup holds no text from the web.
          html: `<span class="map-pin ${pinKind(row)}"><span>${row.rank}</span></span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
          popupAnchor: [0, -28]
        }),
        title: `#${row.rank} ${v.name}`,
        riseOnHover: true,
        zIndexOffset: row.rank === 1 ? 1000 : -row.rank
      });
      marker.bindPopup(() => popupFor(row, currency, (id) => showRef.current(id)), { maxWidth: 240 });
      group.addLayer(marker);
    }

    const points: L.LatLngExpression[] = [[home.latitude, home.longitude], ...mapped.map((r) => [r.result.vendor.location.latitude, r.result.vendor.location.longitude] as L.LatLngTuple)];
    if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 16 });
    else m.setView([home.latitude, home.longitude], 13);
  }, [mapped, home.latitude, home.longitude, currency]);

  return (
    <section className={`band overflow-hidden ${className}`} aria-label="Map of the deals near you">
      <div ref={holder} className={`map-holder ${tall ? 'map-holder-tall' : ''}`} />
      <div className="flex items-center gap-2 px-3 py-2 border-t b-rule text-[13px]">
        <p className="t-mute min-w-0 flex-1" role="status">
          {mapped.length === 0
            ? 'Nothing here has a known place yet.'
            : `${mapped.length} on the map`}
          {offMap > 0 ? ` · ${offMap} online ${offMap === 1 ? 'offer is' : 'offers are'} not on the map` : ''}
        </p>
        {onPinShop && (
          <button type="button" onClick={onPinShop} className="btn shrink-0" title="Pin a shop that is not on the map">
            <MapPinPlus />
            Pin a shop
          </button>
        )}
      </div>
      {/* The pins as a list, for keyboard and screen reader users. */}
      <ol className="sr-only">
        {mapped.map((row) => (
          <li key={row.result.vendor.id}>
            <button type="button" onClick={() => onShowInList(row.result.vendor.id)}>
              {`Rank ${row.rank}: ${row.result.vendor.name}, ${priceLine(row, currency)}${
                row.result.breakdown.distanceKm !== undefined ? `, ${row.result.breakdown.distanceKm} km` : ''
              }`}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
