import { VendorService, GeoLocation, ServiceCategory } from './types';
import { parseB2BSearchQuery, ParsedIntent } from './queryParser';
import { fetchText } from './net';
import { calculateHaversineDistanceKm } from './distance';

interface NominatimPlace {
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  class?: string;
  type: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
}

interface StoreType {
  /** What to ask the map for. */
  phrase: string;
  /** How to describe the store to the user. */
  label: string;
  /** Query tokens (stemmed) that this kind of store plausibly stocks. */
  triggers: string[];
  /** Categories this kind of store serves when no trigger word is present. */
  categories?: ServiceCategory[];
}

/**
 * Which kinds of physical store stock what. The map knows what a shop is
 * (shop=electronics), not what is on its shelves, so a product is matched to the
 * kinds of shop that carry it and the result is labelled as that, never as a
 * confirmed stockist.
 */
const STORE_TYPES: StoreType[] = [
  {
    phrase: 'electronics shop',
    label: 'electronics shop',
    triggers: [
      'arduino', 'resistor', 'capacitor', 'microcontroller', 'stm32', 'esp32', 'esp8266', 'sensor', 'pcb',
      'electronics', 'component', 'breadboard', 'multimeter', 'oscilloscope', 'soldering', 'solder', 'led',
      'transistor', 'diode', 'relay', 'module', 'raspberry', 'battery', 'charger', 'cable', 'adapter',
      'speaker', 'headphone', 'earphone', 'tv', 'television', 'radio', 'camera', 'drone'
    ],
    categories: ['Lab Components & Hardware']
  },
  {
    phrase: 'computer shop',
    label: 'computer shop',
    triggers: [
      'laptop', 'computer', 'pc', 'desktop', 'monitor', 'keyboard', 'mouse', 'ssd', 'hdd', 'ram', 'printer',
      'router', 'usb', 'webcam', 'gpu', 'macbook', 'chromebook', 'thinkpad', 'tablet', 'ipad', 'raspberry'
    ]
  },
  {
    phrase: 'mobile phone shop',
    label: 'phone shop',
    triggers: ['phone', 'smartphone', 'iphone', 'samsung', 'tecno', 'infinix', 'itel', 'xiaomi', 'pixel', 'sim', 'airtime', 'powerbank']
  },
  {
    phrase: 'hardware store',
    label: 'hardware store',
    triggers: ['tool', 'drill', 'hammer', 'screw', 'screwdriver', 'paint', 'plumbing', 'wire', 'pliers', 'saw', 'glue', 'tape', 'ladder', 'cement']
  },
  {
    phrase: 'bookshop',
    label: 'bookshop',
    triggers: ['book', 'textbook', 'novel', 'notebook', 'stationery', 'pen', 'calculator']
  },
  {
    phrase: 'supermarket',
    label: 'supermarket',
    triggers: ['grocery', 'food', 'rice', 'milk', 'bread', 'snack', 'drink', 'water', 'detergent', 'soap'],
    categories: ['Food & Campus Dining']
  },
  {
    phrase: 'restaurant',
    label: 'restaurant',
    triggers: ['meal', 'lunch', 'dinner', 'breakfast', 'restaurant', 'takeout', 'pizza', 'burger', 'jollof', 'waakye', 'dining'],
    categories: ['Food & Campus Dining']
  },
  {
    phrase: 'pharmacy',
    label: 'pharmacy',
    triggers: ['pharmacy', 'medicine', 'drug', 'paracetamol', 'vitamin', 'sanitizer', 'mask']
  },
  {
    phrase: 'clothes shop',
    label: 'clothes shop',
    triggers: ['shirt', 'dress', 'jeans', 'trouser', 'clothes', 'clothing', 'jacket', 'hoodie', 'uniform']
  },
  {
    phrase: 'shoe shop',
    label: 'shoe shop',
    triggers: ['shoe', 'sneaker', 'boot', 'sandal', 'trainer']
  },
  {
    phrase: 'furniture shop',
    label: 'furniture shop',
    triggers: ['chair', 'desk', 'table', 'bed', 'mattress', 'sofa', 'shelf', 'wardrobe', 'furniture']
  },
  {
    phrase: 'bicycle shop',
    label: 'bicycle shop',
    triggers: ['bicycle', 'bike', 'helmet']
  },
  {
    phrase: 'travel agency',
    label: 'travel agency',
    triggers: ['flight', 'airfare', 'ticket', 'visa', 'tour'],
    categories: ['Student Flights & Travel']
  },
  {
    phrase: 'warehouse',
    label: 'warehouse',
    triggers: ['warehouse', 'warehousing', 'storage', 'fulfillment', '3pl'],
    categories: ['3PL Warehousing & Logistics']
  },
  {
    phrase: 'freight forwarder',
    label: 'freight and logistics office',
    triggers: ['freight', 'cargo', 'logistics', 'shipping', 'customs', 'courier'],
    categories: ['Supply Chain & Bulk Freight']
  },
  {
    phrase: 'accountant',
    label: 'accounting office',
    triggers: ['accountant', 'accounting', 'bookkeeping', 'bookkeeper', 'cpa', 'tax', 'audit'],
    categories: ['Accounting & Tax']
  },
  {
    phrase: 'lawyer',
    label: 'law office',
    triggers: ['lawyer', 'attorney', 'legal', 'solicitor', 'notary'],
    categories: ['Legal & Compliance']
  }
];

/** The kinds of store worth asking the map for, best match first. At most two. */
export function storeTypesForQuery(parsed: ParsedIntent): StoreType[] {
  const tokens = new Set(parsed.tokens);
  const scored = STORE_TYPES.map((type) => {
    let score = type.triggers.filter((t) => tokens.has(t)).length * 2;
    if (score === 0 && parsed.category && parsed.categoryConfidence >= 0.6 && type.categories?.includes(parsed.category)) {
      score = 1;
    }
    return { type, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((s) => s.type);
}

const PLACE_CLASSES = new Set(['shop', 'amenity', 'craft', 'office', 'industrial', 'building', 'tourism']);

/** A box of roughly `km` around a point, as Nominatim's viewbox (left, top, right, bottom). */
function viewbox(lat: number, lon: number, km: number): string {
  const dLat = km / 111;
  const dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((n) => n.toFixed(5)).join(',');
}

async function searchPlaces(
  phrase: string,
  location: GeoLocation,
  radiusKm: number,
  signal?: AbortSignal,
  onIssue?: (issue: string) => void
): Promise<NominatimPlace[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(phrase)}` +
    `&format=jsonv2&limit=8&addressdetails=1&extratags=1&bounded=1` +
    `&viewbox=${viewbox(location.latitude, location.longitude, radiusKm)}`;
  const res = await fetchText(url, {
    timeoutMs: 5000,
    signal,
    cacheTtlMs: 30 * 60 * 1000,
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) {
    if (res.error !== 'cancelled') {
      onIssue?.(
        res.status === 429
          ? 'OpenStreetMap is rate limiting store lookups'
          : `OpenStreetMap store lookup failed (${res.error || res.status})`
      );
    }
    return [];
  }
  try {
    const data = JSON.parse(res.text);
    return Array.isArray(data) ? (data as NominatimPlace[]) : [];
  } catch {
    return [];
  }
}

function validWebsite(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(url).toString();
  } catch {
    return undefined;
  }
}

function toVendor(
  place: NominatimPlace,
  userLocation: GeoLocation,
  category: ServiceCategory,
  basis: { label: string; byName: boolean },
  query: string
): VendorService | undefined {
  const name = (place.name || '').trim();
  const lat = parseFloat(place.lat);
  const lon = parseFloat(place.lon);
  // An unnamed map feature is not something a buyer can walk into and ask for.
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;

  const address = place.address || {};
  const tags = place.extratags || {};
  const street = [address.road, address.suburb || address.neighbourhood].filter(Boolean).join(', ');
  const city = address.city || address.town || address.village || userLocation.city;
  const website = validWebsite(tags.website || tags['contact:website'] || tags.url);
  const phone = tags.phone || tags['contact:phone'];
  const hours = tags.opening_hours;
  const distanceKm = calculateHaversineDistanceKm(userLocation.latitude, userLocation.longitude, lat, lon);

  const features = [`Walk-in ${basis.label}, ${distanceKm} km from you`];
  if (hours) features.push(`Hours: ${hours}`);
  if (phone) features.push(`Phone: ${phone}`);
  features.push(website ? 'Has a website' : 'No website listed');
  features.push('Stock and prices are not published: call or visit to confirm');

  return {
    id: `osm-local-${place.place_id}`,
    name,
    category,
    serviceType: 'local_physical',
    targetAudience: ['student', 'business'],
    location: {
      city,
      stateOrRegion: address.state || userLocation.stateOrRegion,
      country: address.country || userLocation.country,
      latitude: lat,
      longitude: lon,
      serviceRadiusKm: 25
    },
    pricing: {
      baseMonthlyCost: 0,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: 'In-store price, not published online',
      contractTerm: 'per_item'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10', '11-50'],
    complianceCertifications: [],
    rating: 0,
    reviewsCount: 0,
    slaGuarantee: hours ? `Open ${hours}` : 'Walk-in store',
    summary: `${name} is a ${basis.label}${street ? ` on ${street}` : ''} in ${city}, listed on OpenStreetMap. The map records what kind of shop this is, not what it has in stock.`,
    keyFeatures: features,
    hasOfficialWebsite: !!website,
    websiteUrl: website || '',
    phone,
    dataSource: 'local',
    priceKnown: false,
    ratingKnown: false,
    locationKnown: true,
    openingHours: hours,
    // A store of the right kind is a plausible lead, ranked below listings that name the product.
    relevanceHint: basis.byName ? 0.6 : 0.45,
    matchBasis: basis.byName
      ? 'A local store whose name matches your search'
      : `A local ${basis.label}: the kind of store that stocks this`
  };
}

export interface LocalSearchOptions {
  signal?: AbortSignal;
  onIssue?: (issue: string) => void;
  radiusKm?: number;
}

/**
 * Finds real stores near the user on OpenStreetMap.
 *
 * Asks for the kinds of store that carry the product ("electronics shop") inside a box
 * around the user's coordinates, and separately for places whose own name matches the
 * search. Returns nothing when the product maps to no kind of store, rather than
 * free-text guesses.
 */
export async function searchLiveLocalStores(
  query: string,
  userLocation: GeoLocation,
  category?: ServiceCategory,
  options: LocalSearchOptions = {}
): Promise<VendorService[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  if (!Number.isFinite(userLocation.latitude) || !Number.isFinite(userLocation.longitude)) return [];

  const parsed = parseB2BSearchQuery(trimmed);
  const rowCategory: ServiceCategory =
    category && category !== 'General Products & Retail'
      ? category
      : parsed.category && parsed.categoryConfidence >= 0.6
      ? parsed.category
      : 'General Products & Retail';
  const radiusKm = options.radiusKm ?? 25;

  try {
    const types = storeTypesForQuery(parsed);
    const found = new Map<number, VendorService>();

    // Nominatim allows one request per second, so the lookups run one after another.
    for (const type of types) {
      const places = await searchPlaces(type.phrase, userLocation, radiusKm, options.signal, options.onIssue);
      for (const place of places) {
        const kind = place.category || place.class || '';
        if (!PLACE_CLASSES.has(kind)) continue;
        const vendor = toVendor(place, userLocation, rowCategory, { label: type.label, byName: false }, parsed.coreQuery);
        if (vendor && !found.has(place.place_id)) found.set(place.place_id, vendor);
      }
      if (options.signal?.aborted) return [];
    }

    // Places named after the search: a brand's own shop, or "Arduino Ghana".
    if (parsed.tokens.length > 0 && parsed.tokens.length <= 3) {
      const places = await searchPlaces(parsed.coreQuery, userLocation, radiusKm, options.signal, options.onIssue);
      for (const place of places) {
        const kind = place.category || place.class || '';
        if (kind !== 'shop' && kind !== 'office' && kind !== 'craft' && kind !== 'amenity') continue;
        const vendor = toVendor(place, userLocation, rowCategory, { label: `${place.type.replace(/_/g, ' ')}`, byName: true }, parsed.coreQuery);
        if (vendor) found.set(place.place_id, vendor);
      }
    }

    return [...found.values()]
      .sort((a, b) => {
        const da = calculateHaversineDistanceKm(userLocation.latitude, userLocation.longitude, a.location.latitude, a.location.longitude);
        const db = calculateHaversineDistanceKm(userLocation.latitude, userLocation.longitude, b.location.latitude, b.location.longitude);
        return da - db;
      })
      .slice(0, 8);
  } catch (err) {
    console.warn('[Hunu] Local store search failed:', err);
    return [];
  }
}
