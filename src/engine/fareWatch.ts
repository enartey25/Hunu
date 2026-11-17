import { HUNU_API_URL, communityEnabled, getDeviceId } from './communityPrices';
import { Trip, routeLabel } from './tripParser';

/** A route the buyer asked Hunu to watch, as the API returns it. */
export interface FareWatch {
  id: number;
  origin: string;
  destination: string;
  date: string | null;
  returnDate: string | null;
  passengers: number;
  label: string;
  targetPrice: number | null;
  lastPrice: number | null;
  previousPrice: number | null;
  lowestPrice: number | null;
  droppedAt: string | null;
  checkedAt: string | null;
  currency: string;
}

/** True when the last daily check found the fare lower than before (or under the target). */
export function hasDropped(w: FareWatch): boolean {
  return !!w.droppedAt && w.lastPrice !== null;
}

export function canWatch(trip: Trip | undefined): boolean {
  return !!trip && communityEnabled() && !!trip.from.iata && !!trip.to.iata && trip.mode !== 'bus';
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${HUNU_API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-hunu-device': await getDeviceId(), ...(init.headers || {}) }
  });
}

/** Starts watching a trip's route at today's cheapest price. Returns an error to show, or undefined. */
export async function watchTrip(trip: Trip, cheapestGHS?: number, targetGHS?: number): Promise<string | undefined> {
  if (!canWatch(trip)) return 'Only flights with a Hunu API can be watched.';
  try {
    const res = await call('/travel/watch', {
      method: 'POST',
      body: JSON.stringify({
        origin: trip.from.iata, destination: trip.to.iata, date: trip.date, returnDate: trip.returnDate,
        passengers: trip.passengers, label: routeLabel(trip), price: cheapestGHS, targetPrice: targetGHS
      })
    });
    if (res.ok) return undefined;
    return ((await res.json().catch(() => ({}))) as { error?: string }).error || `HTTP ${res.status}`;
  } catch (err) {
    return String((err as Error)?.message || err);
  }
}

export async function listWatches(): Promise<FareWatch[]> {
  if (!communityEnabled()) return [];
  try {
    const res = await call('/travel/watches');
    if (!res.ok) return [];
    return ((await res.json()) as { watches?: FareWatch[] }).watches || [];
  } catch {
    return [];
  }
}

export async function stopWatching(id: number): Promise<boolean> {
  try {
    const res = await call(`/travel/watch/${id}/delete`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/** The search that shows a watched route again: "ACC to LON 2026-12-12". */
export function watchQuery(w: FareWatch): string {
  const [from, to] = (w.label || '').split(' → ');
  return [from || w.origin, 'to', to || w.destination, w.date || '', w.passengers > 1 ? `${w.passengers} adults` : '']
    .filter(Boolean)
    .join(' ');
}
