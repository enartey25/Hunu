import { TravelPlace, placeAt, nearestPlace } from './travelPlaces';

/**
 * Reads a search as a trip: "Accra to London 12 Dec", "flight acc lhr",
 * "bus to Kumasi friday", "Legon to Tamale". Returns undefined for anything that is
 * not one, so "laptop in Accra" stays a product search.
 */
export interface Trip {
  from: TravelPlace;
  to: TravelPlace;
  /** True when the start was not said and was taken from the buyer's location. */
  fromAssumed: boolean;
  /** Departure day "2026-12-12", or a whole month "2026-12". */
  date?: string;
  returnDate?: string;
  passengers: number;
  /** What the buyer asked for; undefined means either. */
  mode?: 'flight' | 'bus';
}

const FLIGHT_WORDS = new Set(['flight', 'flights', 'fly', 'flying', 'plane', 'airfare', 'airfares', 'airline', 'airlines', 'air']);
const BUS_WORDS = new Set(['bus', 'buses', 'coach', 'vip', 'stc', 'trotro', 'intercity', 'road']);
const TRIP_WORDS = new Set(['ticket', 'tickets', 'fare', 'fares', 'trip', 'travel', 'transport', 'return', 'one-way', 'oneway']);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function monthOf(word: string): number | undefined {
  const i = MONTHS.indexOf(word.slice(0, 3));
  return i >= 0 && (word.length === 3 || 'january february march april may june july august september october november december sept'.includes(word)) ? i : undefined;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isoMonth = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;

/** The next date (today or later) with this month and day. */
function nextDate(month: number, day: number, today: Date): Date {
  const d = new Date(today.getFullYear(), month, day);
  if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Dates in `words`, in the order they appear, each with the index where it starts. */
function findDates(words: string[], today: Date): { at: number; value: string }[] {
  const out: { at: number; value: string }[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1] || '';
    const day = /^(\d{1,2})(st|nd|rd|th)?$/.exec(w);
    if (day && monthOf(next) !== undefined) {
      out.push({ at: i, value: iso(nextDate(monthOf(next)!, +day[1], today)) });
      i++;
      continue;
    }
    if (monthOf(w) !== undefined && w.length >= 3) {
      const d = /^(\d{1,2})(st|nd|rd|th)?$/.exec(next);
      if (d) {
        out.push({ at: i, value: iso(nextDate(monthOf(w)!, +d[1], today)) });
        i++;
      } else if (w !== 'may' || /^(in|for|of)$/.test(words[i - 1] || '')) {
        const m = monthOf(w)!;
        const y = m < today.getMonth() ? today.getFullYear() + 1 : today.getFullYear();
        out.push({ at: i, value: isoMonth(y, m) });
      }
      continue;
    }
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(w)) {
      out.push({ at: i, value: w });
      continue;
    }
    const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(w);
    if (slash) {
      // Ghana writes day/month.
      const d = nextDate(+slash[2] - 1, +slash[1], today);
      if (slash[3]) d.setFullYear(slash[3].length === 2 ? 2000 + +slash[3] : +slash[3]);
      out.push({ at: i, value: iso(d) });
      continue;
    }
    if (w === 'today') out.push({ at: i, value: iso(today) });
    else if (w === 'tomorrow') out.push({ at: i, value: iso(new Date(today.getTime() + 864e5)) });
    else if (w === 'next' && next === 'week') out.push({ at: i++, value: iso(new Date(today.getTime() + 7 * 864e5)) });
    else if (w === 'next' && next === 'month') {
      const m = (today.getMonth() + 1) % 12;
      out.push({ at: i++, value: isoMonth(m === 0 ? today.getFullYear() + 1 : today.getFullYear(), m) });
    } else if (DAYS.includes(w.slice(0, 3)) && /^(sun|mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?)(day)?$/.test(w)) {
      const target = DAYS.indexOf(w.slice(0, 3));
      const ahead = (target - today.getDay() + 7) % 7 || 7;
      out.push({ at: i, value: iso(new Date(today.getTime() + ahead * 864e5)) });
    }
  }
  return out;
}

export function parseTrip(query: string, home: { latitude: number; longitude: number }, today = new Date()): Trip | undefined {
  const words = query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9/\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return undefined;

  const places: { at: number; length: number; place: TravelPlace }[] = [];
  for (let i = 0; i < words.length; i++) {
    const hit = placeAt(words, i);
    if (hit) {
      places.push({ at: i, ...hit });
      i += hit.length - 1;
    }
  }
  if (places.length === 0) return undefined;

  const flight = words.some((w) => FLIGHT_WORDS.has(w));
  const bus = words.some((w) => BUS_WORDS.has(w));
  const tripWord = flight || bus || words.some((w) => TRIP_WORDS.has(w));

  // "from X" and "to Y" say which is which; otherwise the order does.
  const before = (p: { at: number }) => words[p.at - 1];
  let from = places.find((p) => before(p) === 'from');
  let to = places.find((p) => before(p) === 'to' && p !== from);
  if (!from && !to && places.length >= 2) [from, to] = [places[0], places[1]];
  if (!to) to = places.find((p) => p !== from);
  if (!from && to) from = places.find((p) => p !== to && p.place !== to!.place);

  // A place alone ("kumasi") is not a trip; "to kumasi" or "bus kumasi" is.
  const saidTo = !!to && before(to) === 'to';
  if (!to || (!from && !saidTo && !tripWord)) return undefined;
  if (from && from.place === to.place) return undefined;
  // "laptop to accra" is a delivery, not a trip: other words must be travel or dates.
  const placeWords = new Set(places.flatMap((p) => Array.from({ length: p.length }, (_, j) => p.at + j)));
  const dates = findDates(words, today);
  const dateWords = new Set(dates.flatMap((d) => [d.at, d.at + 1]));
  const filler = new Set(['to', 'from', 'on', 'in', 'for', 'a', 'the', 'cheap', 'cheapest', 'one', 'way', 'and', 'back', 'returning', 'return', 'me', 'my', 'next', 'this', 'student', 'price', 'prices', 'how', 'much', 'is', 'people', 'person', 'adults', 'adult', 'passengers', 'passenger', 'x']);
  const stray = words.filter((w, i) => !placeWords.has(i) && !dateWords.has(i) && !filler.has(w) && !FLIGHT_WORDS.has(w) && !BUS_WORDS.has(w) && !TRIP_WORDS.has(w) && !/^\d+$/.test(w));
  if (stray.length > 1 || (stray.length === 1 && !tripWord)) return undefined;

  const fromPlace = from?.place || nearestPlace(home.latitude, home.longitude);
  if (fromPlace === to.place) return undefined;

  const pax = /(\d{1,2})\s*(?:x\s*)?(?:people|persons?|adults?|passengers?|tickets?)\b/.exec(words.join(' '));
  let mode: Trip['mode'] = flight && !bus ? 'flight' : bus && !flight ? 'bus' : undefined;
  if (!mode && !(fromPlace.ghana && to.place.ghana)) mode = 'flight';

  return {
    from: fromPlace,
    to: to.place,
    fromAssumed: !from,
    date: dates[0]?.value,
    returnDate: dates[1]?.value,
    passengers: pax ? Math.max(1, Math.min(9, +pax[1])) : 1,
    mode
  };
}

/** "Accra → Kumasi", for headings and alerts. */
export function routeLabel(trip: Pick<Trip, 'from' | 'to'>): string {
  return `${trip.from.name} → ${trip.to.name}`;
}
