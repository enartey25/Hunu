/**
 * What each store publishes about delivery, and the market rates used when a store
 * publishes nothing. Every entry says where it came from and when it was read, so a
 * figure on a card can always be traced. Nothing here is presented as the seller's own
 * charge unless the seller stated it.
 *
 * Re-check these when a store changes its policy. Read on 2026-11-16 unless noted.
 */
import { toUSD } from './currency';
import { GeoLocation } from './types';

export const POLICIES_CHECKED_ON = '2026-11-16';

/** A delivery fee range in a local currency, with the page it was taken from. */
export interface RateBand {
  min: number;
  max: number;
  currency: string;
  label: string;
  sourceUrl: string;
}

/**
 * Typical courier rates in Ghana. These are market estimates from a 2026 logistics guide,
 * not any seller's price, and are always shown as a range marked "estimate".
 */
export const GHANA_BANDS: { sameCity: RateBand; betweenCities: RateBand } = {
  sameCity: {
    min: 15,
    max: 40,
    currency: 'GHS',
    label: 'usual courier rates within a city in Ghana',
    sourceUrl: 'https://kolonell.com/en/blog/last-mile-delivery-accra-kumasi-courier-cost-2026'
  },
  betweenCities: {
    min: 60,
    max: 120,
    currency: 'GHS',
    label: 'usual courier rates between cities in Ghana (Accra to Kumasi)',
    sourceUrl: 'https://kolonell.com/en/blog/last-mile-delivery-accra-kumasi-courier-cost-2026'
  }
};

export function bandUSD(band: RateBand): { minUSD: number; maxUSD: number } | undefined {
  const minUSD = toUSD(band.min, band.currency);
  const maxUSD = toUSD(band.max, band.currency);
  return minUSD === undefined || maxUSD === undefined ? undefined : { minUSD, maxUSD };
}

export const inGhana = (place: GeoLocation) => /ghana/i.test(place.country || '');
export const inGreaterAccra = (place: GeoLocation) =>
  inGhana(place) && (/greater accra|accra|tema/i.test(`${place.stateOrRegion} ${place.city}`));

/** What a store's policy says for one destination. */
export interface PolicyAnswer {
  /**
   * 'free': the store charges nothing here (as read from its own checkout or policy).
   * 'band': the store quotes per order; use the given typical band.
   * 'unknown': the store states its fee only at checkout, or does not deliver here.
   */
  kind: 'free' | 'band' | 'unknown';
  band?: RateBand;
  basis: string;
  condition?: string;
  transit?: string;
  sourceUrl: string;
  importChargesMayApply?: boolean;
}

interface StorePolicy {
  /** Matched against the end of the offer's domain. */
  domains: string[];
  answer: (destination: GeoLocation) => PolicyAnswer | undefined;
}

const JIJI_SAFETY = 'https://jiji.com.gh/safety-tips.html';
const sameOrOtherCity = (d: GeoLocation) => (inGreaterAccra(d) ? GHANA_BANDS.sameCity : GHANA_BANDS.betweenCities);

const POLICIES: StorePolicy[] = [
  {
    domains: ['compughana.com'],
    // CompuGhana's checkout offers one rate for Ghana: GH₵ 0.00, named "Free Delivery only
    // applies to Orders within Close areas in Accra & Tema." (read from its cart, 2026-11-16).
    answer: (d) =>
      !inGhana(d)
        ? undefined
        : inGreaterAccra(d)
        ? {
            kind: 'free',
            basis: 'CompuGhana checkout for Greater Accra',
            condition: 'Free only within close areas of Accra and Tema',
            sourceUrl: 'https://compughana.com/cart'
          }
        : {
            kind: 'unknown',
            basis: 'CompuGhana’s free delivery covers only close areas of Accra and Tema. Ask them about delivery to you, or collect at a store',
            sourceUrl: 'https://compughana.com/cart'
          }
  },
  {
    domains: ['telefonika.com'],
    // Telefonika's checkout returned "Standard" at GH₵ 0.00 for Greater Accra and Ashanti.
    answer: (d) =>
      inGhana(d) && /greater accra|accra|tema|ashanti|kumasi/i.test(`${d.stateOrRegion} ${d.city}`)
        ? { kind: 'free', basis: `Telefonika checkout for ${d.stateOrRegion || d.city}`, sourceUrl: 'https://telefonika.com/cart' }
        : undefined
  },
  {
    domains: ['starlite.com.gh'],
    answer: (d) =>
      !inGhana(d)
        ? undefined
        : inGreaterAccra(d)
        ? {
            kind: 'band',
            band: GHANA_BANDS.sameCity,
            basis: 'Starlite sends its delivery fee with the payment instructions, so this is the usual Accra courier range',
            transit: '24 to 48 hours, not Sundays',
            sourceUrl: 'https://starlite.com.gh/policies/shipping-policy'
          }
        : {
            kind: 'unknown',
            basis: 'Starlite delivers within Accra. For elsewhere it asks you to call 0240900600',
            sourceUrl: 'https://starlite.com.gh/policies/shipping-policy'
          }
  },
  {
    domains: ['jumia.com.gh', 'jumia.com.ng', 'jumia.co.ke'],
    answer: (d) =>
      inGhana(d)
        ? {
            kind: 'band',
            band: sameOrOtherCity(d),
            basis: 'Jumia shows its fee at checkout, by item size and area. This is the usual courier range',
            condition: 'Collecting from a Jumia pickup station is usually cheaper',
            sourceUrl: 'https://www.jumia.com.gh'
          }
        : undefined
  },
  {
    domains: ['jiji.com.gh', 'tonaton.com'],
    answer: (d) =>
      inGhana(d)
        ? {
            kind: 'band',
            band: sameOrOtherCity(d),
            basis: 'The seller arranges delivery. This is the usual courier range',
            condition: 'Agree the fee first, and never pay before you have seen the item',
            sourceUrl: JIJI_SAFETY
          }
        : undefined
  },
  {
    domains: ['aliexpress.com'],
    answer: () => ({
      kind: 'unknown',
      basis: 'AliExpress states delivery per item at checkout',
      transit: 'Standard shipping to Ghana usually takes 20 to 60 days',
      sourceUrl: 'https://www.aliexpress.com',
      importChargesMayApply: true
    })
  },
  {
    domains: ['amazon.com'],
    answer: () => ({
      kind: 'unknown',
      basis: 'Amazon shows at checkout whether, and for how much, an item ships to you. Many items do not ship to Ghana',
      sourceUrl: 'https://www.amazon.com',
      importChargesMayApply: true
    })
  }
];

/** The store's own policy for this destination, when Hunu has one. */
export function policyFor(domain: string, destination: GeoLocation): PolicyAnswer | undefined {
  const host = domain.toLowerCase().replace(/^www\./, '');
  const policy = POLICIES.find((p) => p.domains.some((d) => host === d || host.endsWith(`.${d}`)));
  return policy?.answer(destination);
}
