/**
 * Shops a buyer pinned on the map: a stall at Makola, a phone shop in Madina, anything
 * the open map does not list. A pin has a place and what the shop sells, but no price;
 * it ranks like a walk-in shop, and the buyer can ask it for a price from its card.
 */
import { GeoLocation, ServiceCategory, VendorService } from './types';
import { calculateHaversineDistanceKm } from './distance';

export interface ShopPinInput {
  name: string;
  /** What the shop sells, in the buyer's words: "laptops, phone repairs". */
  sells: string;
  area?: string;
  phone?: string;
  latitude: number;
  longitude: number;
  /** The buyer's own location: country and region for the row, and the distance shown. */
  buyer: GeoLocation;
  category?: ServiceCategory;
  /** Set when the pin came from another Hunu user. */
  shared?: { id: number; confirmations: number };
  pinnedAt?: number;
}

/** True when a row has a real place to put on a map. Web listings and 0,0 do not. */
export function isMappable(vendor: VendorService): boolean {
  const { latitude, longitude } = vendor.location;
  return (
    vendor.locationKnown !== false &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0)
  );
}

/** A pinned shop as a row the ranking can score. Undefined when the name or the place is missing. */
export function shopPinToVendor(input: ShopPinInput): VendorService | undefined {
  const name = input.name.trim();
  const sells = input.sells.trim();
  const area = (input.area || '').trim();
  const phone = (input.phone || '').trim();
  const { latitude, longitude } = input;
  if (name.length < 2 || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    return undefined;
  }
  const pinnedAt = input.pinnedAt ?? Date.now();
  const distanceKm = calculateHaversineDistanceKm(input.buyer.latitude, input.buyer.longitude, latitude, longitude);
  const by = input.shared ? 'a Hunu user' : 'you';

  return {
    id: input.shared ? `shop-pin-${input.shared.id}` : `pinned-shop-${pinnedAt}`,
    name,
    category: input.category || 'General Products & Retail',
    serviceType: 'local_physical',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: {
      city: area || input.buyer.city,
      stateOrRegion: input.buyer.stateOrRegion,
      country: input.buyer.country,
      latitude,
      longitude,
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
    slaGuarantee: 'Walk-in shop',
    // What it sells is in the summary and features, which is what a search is matched against.
    summary: `${name}${area ? ` in ${area}` : ''}, pinned on the map by ${by}.${sells ? ` Sells: ${sells}.` : ''} Prices are not published: ask before you go.`,
    keyFeatures: [
      sells ? `Sells ${sells}` : '',
      `Walk-in shop, ${distanceKm} km from you`,
      phone ? `Phone: ${phone}` : '',
      'Stock and prices are not published: call or visit to confirm'
    ].filter(Boolean),
    websiteUrl: '',
    hasOfficialWebsite: false,
    phone: phone || undefined,
    dataSource: 'pinned',
    priceKnown: false,
    ratingKnown: false,
    locationKnown: true,
    // The hint is a floor. A shared pin was fetched for this very search (it shares a word
    // with it), so it is a lead like an OpenStreetMap shop of the right kind. The buyer's
    // own pins are stored and join every search, so they must match on their words alone.
    ...(input.shared ? { relevanceHint: 0.45 } : {}),
    matchBasis: `A shop pinned by ${by}${sells ? ` that sells ${sells}` : ''}`,
    pinnedAt,
    communityShop: input.shared
  };
}

/** How a pinned shop is described on its card. */
export function pinNote(vendor: VendorService, now: number = Date.now()): string | undefined {
  if (vendor.dataSource !== 'pinned') return undefined;
  const days = vendor.pinnedAt ? Math.max(0, Math.floor((now - vendor.pinnedAt) / 86_400_000)) : 0;
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  if (!vendor.communityShop) return `Pinned by you ${when}`;
  const agreed = vendor.communityShop.confirmations > 0 ? `, confirmed by ${vendor.communityShop.confirmations}` : '';
  return `Pinned by a Hunu user ${when}${agreed}`;
}
