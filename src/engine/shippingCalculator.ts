/**
 * What delivery costs the buyer, and how sure Hunu is of it.
 *
 * In order of trust:
 *   1. What the seller states: its product page or its own checkout ("exact" / "free").
 *   2. The store's published policy for the buyer's area (deliveryPolicies.ts).
 *   3. Usual courier rates in the buyer's country, always shown as a range ("estimate").
 *   4. Nothing usable: "unknown". The card says so; ranking uses an assumption that is
 *      never displayed as a price.
 * Shops the buyer walks into, quotes and pins are "pickup": the buyer collects.
 */
import { DeliveryEstimate, GeoLocation, VendorService } from './types';
import { toUSD } from './currency';
import { extractDomain } from './urlResolver';
import { GHANA_BANDS, POLICIES_CHECKED_ON, RateBand, bandUSD, inGhana, policyFor } from './deliveryPolicies';

/** Kept for existing imports. */
export type ShippingEstimate = DeliveryEstimate;

const NO_SHIPPING_CATEGORIES = new Set([
  'Student Software & Offers',
  'Student Flights & Travel',
  'Cloud Infrastructure & DevOps',
  'Legal & Compliance',
  'Payroll & HR',
  'Accounting & Tax',
  'Enterprise Cybersecurity'
]);

/** Distance up to which a domestic delivery counts as within one city. */
const SAME_CITY_KM = 30;

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const mid = (a: number, b: number) => Math.round(((a + b) / 2) * 100) / 100;

/**
 * Used only to rank an offer whose delivery cost is unknown, so it is not treated as
 * free. Never shown to the buyer as a price.
 */
function rankingAssumptionUSD(vendor: VendorService, sameCountry: boolean, dist: number): number {
  if (vendor.category === 'Supply Chain & Bulk Freight' || vendor.category === '3PL Warehousing & Logistics') {
    return dist > 6000 ? 420 : dist > 100 ? 180 : 85;
  }
  if (vendor.category === 'Food & Campus Dining') return dist <= 15 ? 3 : 5;
  if (sameCountry) return dist <= SAME_CITY_KM ? 4 : 10;
  return dist > 8000 ? 28 : 24;
}

function fromBand(
  band: RateBand,
  base: Pick<DeliveryEstimate, 'originCity' | 'destinationCity'>,
  basis: string,
  extra: Partial<DeliveryEstimate> = {}
): DeliveryEstimate | undefined {
  const usd = bandUSD(band);
  if (!usd) return undefined;
  return {
    ...base,
    kind: 'range',
    estimatedCostUSD: mid(usd.minUSD, usd.maxUSD),
    minUSD: usd.minUSD,
    maxUSD: usd.maxUSD,
    isFreeShipping: false,
    deliveryEstimate: '',
    courierName: 'Courier',
    basis,
    sourceUrl: band.sourceUrl,
    checkedOn: POLICIES_CHECKED_ON,
    ...extra
  };
}

export function calculateShippingEstimate(
  vendor: VendorService,
  distanceKm: number | undefined,
  destination: GeoLocation
): DeliveryEstimate {
  const sameCountry =
    !!vendor.location.country && vendor.location.country.toLowerCase() === destination.country.toLowerCase();
  const dist = distanceKm ?? (sameCountry ? 40 : 5000);
  const base = {
    originCity: `${vendor.location.city}, ${vendor.location.country}`,
    destinationCity: `${destination.city}, ${destination.country}`
  };
  const zero = (kind: 'exact' | 'pickup', deliveryEstimate: string, courierName: string, basis: string): DeliveryEstimate => ({
    ...base,
    kind,
    estimatedCostUSD: 0,
    minUSD: 0,
    maxUSD: 0,
    isFreeShipping: kind === 'exact',
    deliveryEstimate,
    courierName,
    basis
  });

  // Nothing physical to send.
  if (vendor.serviceType === 'digital_remote' || NO_SHIPPING_CATEGORIES.has(vendor.category)) {
    return zero('exact', 'Instant digital access', 'Online delivery', 'Nothing is shipped');
  }

  // Shops the buyer walks into, prices quoted at a counter, shops pinned on the map.
  if (vendor.dataSource === 'local' || vendor.dataSource === 'quote' || vendor.dataSource === 'community' || vendor.dataSource === 'pinned') {
    return zero('pickup', 'You collect', 'In person', 'You collect from the seller, so there is no delivery charge');
  }

  // 1. What the seller itself states.
  if (vendor.delivery) {
    const d = vendor.delivery;
    const usd = d.kind === 'free' ? 0 : toUSD(d.amount, d.currency);
    if (usd !== undefined) {
      return {
        ...base,
        kind: d.kind === 'free' || usd === 0 ? 'free' : 'exact',
        estimatedCostUSD: usd,
        minUSD: usd,
        maxUSD: usd,
        isFreeShipping: usd === 0,
        deliveryEstimate: d.transit || '',
        courierName: 'Seller delivery',
        basis: d.basis,
        condition: d.condition,
        sourceUrl: d.sourceUrl,
        checkedOn: d.checkedAt ? isoDate(d.checkedAt) : undefined,
        importChargesMayApply: !sameCountry || undefined
      };
    }
  }

  // 2. The store's published policy for the buyer's area.
  const domain = extractDomain(vendor.exactOrderUrl || vendor.websiteUrl || '');
  const policy = domain ? policyFor(domain, destination) : undefined;
  if (policy) {
    const extra: Partial<DeliveryEstimate> = {
      condition: policy.condition,
      deliveryEstimate: policy.transit || '',
      importChargesMayApply: policy.importChargesMayApply
    };
    if (policy.kind === 'free') {
      return {
        ...zero('exact', policy.transit || '', 'Store delivery', policy.basis),
        kind: 'free',
        isFreeShipping: true,
        ...extra,
        sourceUrl: policy.sourceUrl,
        checkedOn: POLICIES_CHECKED_ON
      };
    }
    if (policy.kind === 'band' && policy.band) {
      const ranged = fromBand(policy.band, base, policy.basis, { ...extra, sourceUrl: policy.sourceUrl });
      if (ranged) return ranged;
    }
    if (policy.kind === 'unknown') {
      return {
        ...base,
        kind: 'unknown',
        estimatedCostUSD: rankingAssumptionUSD(vendor, sameCountry, dist),
        isFreeShipping: false,
        deliveryEstimate: policy.transit || '',
        courierName: 'Store delivery',
        basis: policy.basis,
        condition: policy.condition,
        sourceUrl: policy.sourceUrl,
        checkedOn: POLICIES_CHECKED_ON,
        importChargesMayApply: policy.importChargesMayApply
      };
    }
  }

  // 3. Usual courier rates, for a seller in the buyer's own country.
  if (sameCountry && inGhana(destination)) {
    const band = dist <= SAME_CITY_KM ? GHANA_BANDS.sameCity : GHANA_BANDS.betweenCities;
    const ranged = fromBand(band, base, `The seller does not publish a delivery fee. This is the ${band.label}`);
    if (ranged) return ranged;
  }

  // 4. Nothing usable.
  return {
    ...base,
    kind: 'unknown',
    estimatedCostUSD: rankingAssumptionUSD(vendor, sameCountry, dist),
    isFreeShipping: false,
    deliveryEstimate: '',
    courierName: sameCountry ? 'Seller delivery' : 'International delivery',
    basis: sameCountry
      ? 'The seller does not publish a delivery fee. Ask before you order'
      : 'The seller states international delivery at checkout, if it ships to you at all',
    importChargesMayApply: !sameCountry || undefined
  };
}
