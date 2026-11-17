/**
 * Flight fares for Hunu's trip searches, from the Travelpayouts (Aviasales) Data API.
 *
 * These are prices Aviasales travellers were shown in the last few days, cached by
 * Aviasales: good for comparing and for watching a route, not a quote to pay. Booking
 * links carry Hunu's partner marker, which earns a commission on a booking.
 *
 * The token stays on the server: the extension and website only call this API.
 */

export interface FareQuery {
  origin: string;
  destination: string;
  /** "2026-12-12" or a month "2026-12"; absent means any date soon. */
  date?: string;
  returnDate?: string;
  passengers: number;
}

export interface Fare {
  airline: string;
  airlineName?: string;
  flightNumber?: string;
  departAt: string;
  returnAt?: string;
  stops: number;
  durationMin?: number;
  price: number;
  currency: string;
  link: string;
  seenOn?: string;
}

export interface CalendarDay {
  date: string;
  price: number;
  currency: string;
}

const IATA = /^[A-Z]{3}$/;
const DAY_OR_MONTH = /^\d{4}-\d{2}(-\d{2})?$/;

export function checkFareQuery(body: unknown): FareQuery | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const code = (v: unknown) => (typeof v === 'string' && IATA.test(v.toUpperCase()) ? v.toUpperCase() : undefined);
  const day = (v: unknown) => (typeof v === 'string' && DAY_OR_MONTH.test(v) ? v : undefined);
  const origin = code(b.origin);
  const destination = code(b.destination);
  if (!origin || !destination || origin === destination) return undefined;
  const passengers = Math.max(1, Math.min(9, Math.floor(Number(b.passengers) || 1)));
  return { origin, destination, date: day(b.date), returnDate: day(b.returnDate), passengers };
}

/** Names for the airlines that fly from Ghana most; others show their code. */
const AIRLINES: Record<string, string> = {
  AW: 'Africa World Airlines', OP: 'PassionAir', KP: 'ASKY Airlines', HF: "Air Côte d'Ivoire", P4: 'Air Peace',
  W3: 'Arik Air', ET: 'Ethiopian Airlines', KQ: 'Kenya Airways', AT: 'Royal Air Maroc', MS: 'EgyptAir',
  SA: 'South African Airways', WB: 'RwandAir', EK: 'Emirates', QR: 'Qatar Airways', EY: 'Etihad',
  TK: 'Turkish Airlines', KL: 'KLM', AF: 'Air France', BA: 'British Airways', VS: 'Virgin Atlantic',
  LH: 'Lufthansa', SN: 'Brussels Airlines', LX: 'Swiss', TP: 'TAP Air Portugal', IB: 'Iberia', UX: 'Air Europa',
  DL: 'Delta', UA: 'United Airlines', AA: 'American Airlines', AC: 'Air Canada', SV: 'Saudia', WY: 'Oman Air',
  FZ: 'flydubai', MH: 'Malaysia Airlines', CZ: 'China Southern', CA: 'Air China', AI: 'Air India', XY: 'flynas'
};

const API = 'https://api.travelpayouts.com/aviasales/v3';
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function getJson(url: string): Promise<any> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const res = await fetch(url, { headers: { accept: 'application/json', 'accept-encoding': 'gzip' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`fare service answered ${res.status}`);
  const value = await res.json();
  if (cache.size > 2000) cache.clear();
  cache.set(url, { at: Date.now(), value });
  return value;
}

function bookingLink(path: string | undefined, q: FareQuery, marker?: string): string {
  const url = new URL(path || `/search/${q.origin}${q.destination}1`, 'https://www.aviasales.com');
  if (marker) url.searchParams.set('marker', marker);
  if (q.passengers > 1) url.searchParams.set('adults', String(q.passengers));
  return url.toString();
}

export interface FareConfig {
  token: string;
  marker?: string;
}

/** Cheapest recent fares for the query, cheapest first, and a ±3 day calendar around a set day. */
export async function findFares(q: FareQuery, config: FareConfig): Promise<{ fares: Fare[]; calendar: CalendarDay[] }> {
  const params = new URLSearchParams({
    origin: q.origin,
    destination: q.destination,
    currency: 'ghs',
    sorting: 'price',
    limit: '20',
    unique: 'false',
    one_way: q.returnDate ? 'false' : 'true',
    token: config.token
  });
  if (q.date) params.set('departure_at', q.date);
  if (q.returnDate) params.set('return_at', q.returnDate);

  const data = await getJson(`${API}/prices_for_dates?${params}`);
  const seenOn = new Date().toISOString().slice(0, 10);
  const fares: Fare[] = (Array.isArray(data?.data) ? data.data : [])
    .filter((d: any) => Number(d?.price) > 0 && typeof d?.departure_at === 'string')
    .map((d: any) => ({
      airline: String(d.airline || ''),
      airlineName: AIRLINES[String(d.airline || '')],
      flightNumber: d.flight_number ? `${d.airline}${d.flight_number}` : undefined,
      departAt: d.departure_at,
      returnAt: d.return_at || undefined,
      stops: Number(d.transfers) || 0,
      durationMin: Number(d.duration_to || d.duration) || undefined,
      price: Number(d.price) * q.passengers,
      currency: String(data.currency || 'ghs').toUpperCase(),
      link: bookingLink(d.link, q, config.marker),
      seenOn
    }));

  let calendar: CalendarDay[] = [];
  if (q.date && q.date.length === 10) {
    const month = q.date.slice(0, 7);
    const grouped = await getJson(
      `${API}/grouped_prices?${new URLSearchParams({ origin: q.origin, destination: q.destination, currency: 'ghs', departure_at: month, group_by: 'departure_at', token: config.token })}`
    ).catch(() => undefined);
    const center = Date.parse(q.date);
    calendar = Object.entries((grouped?.data || {}) as Record<string, any>)
      .filter(([day, v]) => Number(v?.price) > 0 && Math.abs(Date.parse(day) - center) <= 3 * 864e5)
      .map(([day, v]) => ({ date: day, price: Number(v.price) * q.passengers, currency: 'GHS' }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return { fares, calendar };
}

/** The cheapest fare for a watched route, or undefined when none was seen. */
export async function cheapestFare(q: FareQuery, config: FareConfig): Promise<number | undefined> {
  const { fares } = await findFares(q, config);
  return fares.length ? Math.min(...fares.map((f) => f.price)) : undefined;
}
