/**
 * Places a trip can start or end at: Ghana's cities with their airports and main bus
 * stations, and the destinations people in Ghana fly to most. Names are matched as
 * whole words, lower case; an IATA code is also accepted ("acc lhr").
 */
export interface TravelPlace {
  /** Display name: "Kumasi". */
  name: string;
  /** City or metropolitan airport code for fare searches ("LON" covers every London airport). */
  iata?: string;
  country: string;
  /** In Ghana: reachable by intercity bus. */
  ghana?: boolean;
  latitude: number;
  longitude: number;
  /** Where intercity buses leave from, in Ghana. */
  stations?: { operator: string; name: string; latitude: number; longitude: number }[];
  /** Other words that name the place. */
  aliases?: string[];
}

export const TRAVEL_PLACES: TravelPlace[] = [
  {
    name: 'Accra', iata: 'ACC', country: 'Ghana', ghana: true, latitude: 5.6037, longitude: -0.187,
    aliases: ['legon', 'tema', 'madina', 'east legon', 'kotoka', 'circle', 'kaneshie', 'achimota'],
    stations: [
      { operator: 'VIP', name: 'VIP station, Circle', latitude: 5.5701, longitude: -0.2149 },
      { operator: 'STC', name: 'STC station, Kaneshie (Accra)', latitude: 5.5698, longitude: -0.2357 },
      { operator: 'Metro Mass', name: 'Metro Mass, Kaneshie', latitude: 5.5713, longitude: -0.2368 }
    ]
  },
  {
    name: 'Kumasi', iata: 'KMS', country: 'Ghana', ghana: true, latitude: 6.6885, longitude: -1.6244,
    aliases: ['knust', 'ashanti'],
    stations: [
      { operator: 'VIP', name: 'VIP station, Asafo', latitude: 6.6848, longitude: -1.6136 },
      { operator: 'STC', name: 'STC station, Adum', latitude: 6.6896, longitude: -1.6265 }
    ]
  },
  { name: 'Tamale', iata: 'TML', country: 'Ghana', ghana: true, latitude: 9.4034, longitude: -0.8424 },
  { name: 'Takoradi', iata: 'TKD', country: 'Ghana', ghana: true, latitude: 4.8845, longitude: -1.7554, aliases: ['sekondi'] },
  { name: 'Cape Coast', country: 'Ghana', ghana: true, latitude: 5.1053, longitude: -1.2466, aliases: ['ucc'] },
  { name: 'Ho', country: 'Ghana', ghana: true, latitude: 6.6008, longitude: 0.4713 },
  { name: 'Sunyani', iata: 'NYI', country: 'Ghana', ghana: true, latitude: 7.3349, longitude: -2.3123 },
  { name: 'Wa', iata: 'WZA', country: 'Ghana', ghana: true, latitude: 10.0601, longitude: -2.5099 },
  { name: 'Bolgatanga', country: 'Ghana', ghana: true, latitude: 10.7856, longitude: -0.8514, aliases: ['bolga'] },
  { name: 'Koforidua', country: 'Ghana', ghana: true, latitude: 6.0941, longitude: -0.2591 },
  { name: 'Aflao', country: 'Ghana', ghana: true, latitude: 6.1164, longitude: 1.1925 },
  ...([
    ['Techiman', 7.5833, -1.9333, ['takyiman']], ['Obuasi', 6.2, -1.6667], ['Tarkwa', 5.3, -1.9833],
    ['Navrongo', 10.8956, -1.0921], ['Bawku', 11.0616, -0.2417], ['Paga', 10.9833, -1.1167],
    ['Wenchi', 7.7333, -2.1], ['Dunkwa', 5.9667, -1.7833, ['dunkwa-on-offin']], ['Mampong', 7.0627, -1.4001],
    ['Kintampo', 8.0563, -1.7306], ['Nkoranza', 7.5667, -1.7], ['Dormaa', 7.2833, -2.8833],
    ['Sampa', 8.0333, -2.6], ['Hamile', 10.9833, -2.6833], ['Kulungugu', 10.9667, -0.1833],
    ['Garu', 10.85, -0.1833], ['Goaso', 6.8, -2.5167], ['Enchi', 5.8167, -2.8167]
  ] as [string, number, number, string[]?][]).map(([name, latitude, longitude, aliases]) => ({
    name, country: 'Ghana', ghana: true, latitude, longitude, aliases
  })),

  { name: 'Lagos', iata: 'LOS', country: 'Nigeria', latitude: 6.5244, longitude: 3.3792 },
  { name: 'Abuja', iata: 'ABV', country: 'Nigeria', latitude: 9.0765, longitude: 7.3986 },
  { name: 'Lomé', iata: 'LFW', country: 'Togo', latitude: 6.1725, longitude: 1.2314, aliases: ['lome'] },
  { name: 'Abidjan', iata: 'ABJ', country: "Côte d'Ivoire", latitude: 5.36, longitude: -4.0083 },
  { name: 'Dakar', iata: 'DSS', country: 'Senegal', latitude: 14.7167, longitude: -17.4677 },
  { name: 'Monrovia', iata: 'ROB', country: 'Liberia', latitude: 6.3156, longitude: -10.8074 },
  { name: 'Freetown', iata: 'FNA', country: 'Sierra Leone', latitude: 8.4657, longitude: -13.2317 },
  { name: 'Ouagadougou', iata: 'OUA', country: 'Burkina Faso', latitude: 12.3714, longitude: -1.5197 },
  { name: 'Nairobi', iata: 'NBO', country: 'Kenya', latitude: -1.2921, longitude: 36.8219 },
  { name: 'Addis Ababa', iata: 'ADD', country: 'Ethiopia', latitude: 9.03, longitude: 38.74, aliases: ['addis'] },
  { name: 'Johannesburg', iata: 'JNB', country: 'South Africa', latitude: -26.2041, longitude: 28.0473, aliases: ['joburg'] },
  { name: 'Cape Town', iata: 'CPT', country: 'South Africa', latitude: -33.9249, longitude: 18.4241 },
  { name: 'Kigali', iata: 'KGL', country: 'Rwanda', latitude: -1.9441, longitude: 30.0619 },
  { name: 'Cairo', iata: 'CAI', country: 'Egypt', latitude: 30.0444, longitude: 31.2357 },
  { name: 'Casablanca', iata: 'CMN', country: 'Morocco', latitude: 33.5731, longitude: -7.5898 },

  { name: 'London', iata: 'LON', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278, aliases: ['uk', 'heathrow', 'gatwick'] },
  { name: 'Manchester', iata: 'MAN', country: 'United Kingdom', latitude: 53.4808, longitude: -2.2426 },
  { name: 'Birmingham', iata: 'BHX', country: 'United Kingdom', latitude: 52.4862, longitude: -1.8904 },
  { name: 'Amsterdam', iata: 'AMS', country: 'Netherlands', latitude: 52.3676, longitude: 4.9041 },
  { name: 'Paris', iata: 'PAR', country: 'France', latitude: 48.8566, longitude: 2.3522 },
  { name: 'Brussels', iata: 'BRU', country: 'Belgium', latitude: 50.8503, longitude: 4.3517 },
  { name: 'Frankfurt', iata: 'FRA', country: 'Germany', latitude: 50.1109, longitude: 8.6821 },
  { name: 'Berlin', iata: 'BER', country: 'Germany', latitude: 52.52, longitude: 13.405 },
  { name: 'Hamburg', iata: 'HAM', country: 'Germany', latitude: 53.5511, longitude: 9.9937 },
  { name: 'Rome', iata: 'ROM', country: 'Italy', latitude: 41.9028, longitude: 12.4964 },
  { name: 'Milan', iata: 'MIL', country: 'Italy', latitude: 45.4642, longitude: 9.19 },
  { name: 'Madrid', iata: 'MAD', country: 'Spain', latitude: 40.4168, longitude: -3.7038 },
  { name: 'Barcelona', iata: 'BCN', country: 'Spain', latitude: 41.3874, longitude: 2.1686 },
  { name: 'Lisbon', iata: 'LIS', country: 'Portugal', latitude: 38.7223, longitude: -9.1393 },
  { name: 'Istanbul', iata: 'IST', country: 'Turkey', latitude: 41.0082, longitude: 28.9784 },
  { name: 'Dublin', iata: 'DUB', country: 'Ireland', latitude: 53.3498, longitude: -6.2603 },
  { name: 'Stockholm', iata: 'STO', country: 'Sweden', latitude: 59.3293, longitude: 18.0686 },
  { name: 'Oslo', iata: 'OSL', country: 'Norway', latitude: 59.9139, longitude: 10.7522 },
  { name: 'Copenhagen', iata: 'CPH', country: 'Denmark', latitude: 55.6761, longitude: 12.5683 },
  { name: 'Zurich', iata: 'ZRH', country: 'Switzerland', latitude: 47.3769, longitude: 8.5417 },
  { name: 'Geneva', iata: 'GVA', country: 'Switzerland', latitude: 46.2044, longitude: 6.1432 },
  { name: 'Vienna', iata: 'VIE', country: 'Austria', latitude: 48.2082, longitude: 16.3738 },

  { name: 'New York', iata: 'NYC', country: 'United States', latitude: 40.7128, longitude: -74.006, aliases: ['nyc', 'jfk'] },
  { name: 'Washington', iata: 'WAS', country: 'United States', latitude: 38.9072, longitude: -77.0369, aliases: ['dc'] },
  { name: 'Atlanta', iata: 'ATL', country: 'United States', latitude: 33.749, longitude: -84.388 },
  { name: 'Houston', iata: 'HOU', country: 'United States', latitude: 29.7604, longitude: -95.3698 },
  { name: 'Chicago', iata: 'CHI', country: 'United States', latitude: 41.8781, longitude: -87.6298 },
  { name: 'Los Angeles', iata: 'LAX', country: 'United States', latitude: 34.0522, longitude: -118.2437, aliases: ['la'] },
  { name: 'Boston', iata: 'BOS', country: 'United States', latitude: 42.3601, longitude: -71.0589 },
  { name: 'Toronto', iata: 'YTO', country: 'Canada', latitude: 43.6532, longitude: -79.3832 },
  { name: 'Montreal', iata: 'YMQ', country: 'Canada', latitude: 45.5017, longitude: -73.5673 },

  { name: 'Dubai', iata: 'DXB', country: 'United Arab Emirates', latitude: 25.2048, longitude: 55.2708 },
  { name: 'Doha', iata: 'DOH', country: 'Qatar', latitude: 25.2854, longitude: 51.531 },
  { name: 'Jeddah', iata: 'JED', country: 'Saudi Arabia', latitude: 21.4858, longitude: 39.1925 },
  { name: 'Riyadh', iata: 'RUH', country: 'Saudi Arabia', latitude: 24.7136, longitude: 46.6753 },
  { name: 'Beirut', iata: 'BEY', country: 'Lebanon', latitude: 33.8938, longitude: 35.5018 },
  { name: 'Guangzhou', iata: 'CAN', country: 'China', latitude: 23.1291, longitude: 113.2644 },
  { name: 'Shanghai', iata: 'SHA', country: 'China', latitude: 31.2304, longitude: 121.4737 },
  { name: 'Beijing', iata: 'BJS', country: 'China', latitude: 39.9042, longitude: 116.4074 },
  { name: 'Hong Kong', iata: 'HKG', country: 'Hong Kong', latitude: 22.3193, longitude: 114.1694 },
  { name: 'Delhi', iata: 'DEL', country: 'India', latitude: 28.7041, longitude: 77.1025, aliases: ['new delhi'] },
  { name: 'Mumbai', iata: 'BOM', country: 'India', latitude: 19.076, longitude: 72.8777 },
  { name: 'Kuala Lumpur', iata: 'KUL', country: 'Malaysia', latitude: 3.139, longitude: 101.6869 },
  { name: 'Sydney', iata: 'SYD', country: 'Australia', latitude: -33.8688, longitude: 151.2093 },
  { name: 'Melbourne', iata: 'MEL', country: 'Australia', latitude: -37.8136, longitude: 144.9631 }
];

const BY_WORDS: { words: string[]; place: TravelPlace }[] = TRAVEL_PLACES.flatMap((place) =>
  [place.name, ...(place.aliases || [])].map((n) => ({
    words: n.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/\s+/),
    place
  }))
).sort((a, b) => b.words.length - a.words.length);

const BY_IATA = new Map(TRAVEL_PLACES.filter((p) => p.iata).map((p) => [p.iata!.toLowerCase(), p]));
// Airports that belong to a city searched under its city code.
const AIRPORTS: Record<string, string> = { lhr: 'lon', lgw: 'lon', stn: 'lon', cdg: 'par', ory: 'par', jfk: 'nyc', ewr: 'nyc', iad: 'was', yyz: 'yto', fco: 'rom', mxp: 'mil', pvg: 'sha', pek: 'bjs' };

/** The place named by `words` starting at `at`, and how many words it took. */
export function placeAt(words: string[], at: number): { place: TravelPlace; length: number } | undefined {
  for (const entry of BY_WORDS) {
    if (entry.words.every((w, j) => words[at + j] === w)) return { place: entry.place, length: entry.words.length };
  }
  const code = words[at];
  if (code && code.length === 3) {
    const place = BY_IATA.get(AIRPORTS[code] || code);
    if (place) return { place, length: 1 };
  }
  return undefined;
}

export function placeByName(name: string): TravelPlace | undefined {
  const words = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  return words.length ? placeAt(words, 0)?.place : undefined;
}

/** The nearest place to a point, for a trip whose start the buyer did not say. */
export function nearestPlace(latitude: number, longitude: number): TravelPlace {
  let best = TRAVEL_PLACES[0];
  let bestD = Infinity;
  for (const p of TRAVEL_PLACES) {
    const d = (p.latitude - latitude) ** 2 + (p.longitude - longitude) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
