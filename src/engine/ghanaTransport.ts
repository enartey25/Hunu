/**
 * Published fares for travel inside Ghana, each with where and when it was read.
 * Bus companies publish fare lists in the press when they change them; nothing here is
 * estimated. A route with no published figure says so instead of showing a number.
 */
export interface PublishedFare {
  operator: string;
  service: string;
  mode: 'bus' | 'flight';
  from: string;
  to: string;
  /** GHS, one way, one passenger. */
  amount: number;
  /** 'exact' is the published fare; 'from' is the lowest the operator advertises. */
  kind: 'exact' | 'from';
  sourceUrl: string;
  sourceName: string;
  checkedOn: string;
  /** Where to buy online; empty when tickets are sold at the station only. */
  bookUrl: string;
  note?: string;
}

const VIP_SOURCE = 'https://www.graphic.com.gh/news/general-news/vip-jeoun-transport-hikes-fares-effective-wednesday-cites-first-review-in-two-years.html';
// VIP's online ticketing, as given by the owner.
const VIP_BOOK = 'https://www.vipbustickets.com/';

// VIP Jeoun's fare list effective 8 April 2026 (Graphic Online). Executive coach, then standard.
const VIP_EXECUTIVE: [string, string, number][] = [
  ['Accra', 'Kumasi', 150], ['Accra', 'Tamale', 360], ['Accra', 'Bolgatanga', 410], ['Accra', 'Sunyani', 200],
  ['Accra', 'Navrongo', 420], ['Accra', 'Paga', 420], ['Accra', 'Bawku', 430], ['Accra', 'Hamile', 450],
  ['Accra', 'Kulungugu', 460], ['Accra', 'Techiman', 200], ['Accra', 'Sampa', 230], ['Accra', 'Dormaa', 220],
  ['Accra', 'Kintampo', 220], ['Accra', 'Nkoranza', 210], ['Accra', 'Obuasi', 180], ['Accra', 'Mampong', 170],
  ['Accra', 'Dunkwa', 190], ['Accra', 'Goaso', 200], ['Kumasi', 'Tamale', 210], ['Kumasi', 'Wa', 240],
  ['Kumasi', 'Kulungugu', 300]
];
const VIP_STANDARD: [string, string, number][] = [
  ['Accra', 'Kumasi', 120], ['Accra', 'Tamale', 290], ['Accra', 'Bolgatanga', 330], ['Accra', 'Sunyani', 170],
  ['Accra', 'Bawku', 340], ['Accra', 'Garu', 350], ['Accra', 'Wenchi', 180], ['Accra', 'Dunkwa', 160],
  ['Accra', 'Tarkwa', 150], ['Accra', 'Takoradi', 120], ['Accra', 'Cape Coast', 110], ['Accra', 'Enchi', 190],
  ['Kumasi', 'Tamale', 170], ['Kumasi', 'Wa', 190]
];

const vip = (service: string, rows: [string, string, number][]): PublishedFare[] =>
  rows.map(([from, to, amount]) => ({
    operator: 'VIP Jeoun',
    service,
    mode: 'bus',
    from,
    to,
    amount,
    kind: 'exact',
    sourceUrl: VIP_SOURCE,
    sourceName: 'VIP Jeoun fare list, Graphic Online',
    checkedOn: '2026-04-08',
    bookUrl: VIP_BOOK
  }));

export const PUBLISHED_FARES: PublishedFare[] = [
  ...vip('Executive coach', VIP_EXECUTIVE),
  ...vip('Standard', VIP_STANDARD),
  {
    operator: 'Africa World Airlines',
    service: 'Economy',
    mode: 'flight',
    from: 'Accra',
    to: 'Kumasi',
    amount: 999,
    kind: 'from',
    sourceUrl: 'https://yen.com.gh/ghana/315488-accra-kumasi-flight-prices-2026-airlines-ranked-highest-cheapest/',
    sourceName: "AWA's advertised lowest fare, reported by Yen.com.gh",
    checkedOn: '2026-11-16',
    bookUrl: 'https://www.flyafricaworld.com',
    note: 'One dated quote for 17 Nov 2026 was about GH₵1,541. Fares change by date.'
  }
];

/** Operators that run a route but publish no fare list Hunu could read. */
export const UNPUBLISHED: { operator: string; mode: 'bus' | 'flight'; bookUrl: string; note: string; ghanaOnly: true }[] = [
  { operator: 'STC', mode: 'bus', bookUrl: 'https://stcticketing.gov.gh', note: 'STC does not publish a fare list. Check the fare on its ticketing site.', ghanaOnly: true },
  { operator: 'PassionAir', mode: 'flight', bookUrl: 'https://www.passionair.com.gh', note: 'Flies Accra, Kumasi, Tamale and Takoradi. Fare on its own site.', ghanaOnly: true }
];

const AIRPORT_CITIES = new Set(['Accra', 'Kumasi', 'Tamale', 'Takoradi', 'Sunyani', 'Wa']);

/** Published fares for a route, in either direction (the lists are the same both ways). */
export function faresFor(from: string, to: string, mode?: 'bus' | 'flight'): PublishedFare[] {
  return PUBLISHED_FARES.filter(
    (f) =>
      (!mode || f.mode === mode) &&
      ((f.from === from && f.to === to) || (f.from === to && f.to === from))
  ).map((f) => (f.from === from ? f : { ...f, from, to }));
}

/** Operators to point to when the route has no published fare from them. */
export function unpublishedFor(from: string, to: string, mode?: 'bus' | 'flight') {
  return UNPUBLISHED.filter((u) => {
    if (mode && u.mode !== mode) return false;
    if (u.mode === 'flight') return AIRPORT_CITIES.has(from) && AIRPORT_CITIES.has(to);
    return true;
  });
}
