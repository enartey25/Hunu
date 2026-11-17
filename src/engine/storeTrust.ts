/**
 * What each store offers a buyer when something goes wrong: the kind of store it is,
 * its returns window, and any buyer protection. Read from each store's own policy pages
 * on 2026-11-16, unless the note says otherwise.
 */

export type StoreKind = 'retailer' | 'marketplace' | 'classifieds';

export interface StoreRecord {
  name: string;
  kind: StoreKind;
  /** Days within which the store takes returns. */
  returnsDays?: number;
  /** True when returns are exchange-only (no refunds). */
  exchangeOnly?: boolean;
  /** The platform refunds the buyer when a seller does not deliver or the item is not as described. */
  buyerProtection?: boolean;
  /** Plain-language summary shown as the store signal. */
  summary: string;
  /** Advice that always applies on this store. */
  advice?: string;
  sourceUrl: string;
  /** Set when the source is not the store's own page. */
  sourceNote?: string;
}

const JIJI_ADVICE = 'Meet somewhere public, check the item, and pay only once you have it. Never pay in advance, not even for delivery.';

const STORES: { domains: string[]; record: StoreRecord }[] = [
  {
    domains: ['jiji.com.gh'],
    record: {
      name: 'Jiji',
      kind: 'classifieds',
      buyerProtection: false,
      summary: 'Classified ads: you deal with the seller directly, and Jiji does not hold your money',
      advice: JIJI_ADVICE,
      sourceUrl: 'https://jiji.com.gh/safety-tips.html'
    }
  },
  {
    domains: ['tonaton.com'],
    record: {
      name: 'Tonaton',
      kind: 'classifieds',
      buyerProtection: false,
      summary: 'Classified ads: you deal with the seller directly, and the site does not hold your money',
      advice: JIJI_ADVICE,
      sourceUrl: 'https://jiji.com.gh/safety-tips.html',
      sourceNote: 'Tonaton runs on the same platform as Jiji'
    }
  },
  {
    domains: ['jumia.com.gh', 'jumia.com.ng', 'jumia.co.ke'],
    record: {
      name: 'Jumia',
      kind: 'marketplace',
      returnsDays: 7,
      summary: 'Marketplace with returns handled by Jumia, usually within 7 days of delivery',
      sourceUrl: 'https://www.dignited.com/97525/jumia-return',
      sourceNote: 'Return window from a consumer guide; Jumia Ghana’s own page was not reachable'
    }
  },
  {
    domains: ['compughana.com'],
    record: {
      name: 'CompuGhana',
      kind: 'retailer',
      returnsDays: 7,
      summary: 'Retailer with stores; returns or refunds within 7 days, unused and in original packaging',
      sourceUrl: 'https://compughana.com/policies/refund-policy'
    }
  },
  {
    domains: ['starlite.com.gh'],
    record: {
      name: 'Starlite',
      kind: 'retailer',
      returnsDays: 7,
      summary: 'Retailer with stores; returns within 7 days, unused and in original packaging',
      sourceUrl: 'https://starlite.com.gh/policies/refund-policy'
    }
  },
  {
    domains: ['telefonika.com'],
    record: {
      name: 'Telefonika',
      kind: 'retailer',
      returnsDays: 14,
      exchangeOnly: true,
      summary: 'Retailer with stores; exchanges within 14 days, but no refunds',
      sourceUrl: 'https://telefonika.com/policies/refund-policy'
    }
  },
  {
    domains: ['aliexpress.com'],
    record: {
      name: 'AliExpress',
      kind: 'marketplace',
      buyerProtection: true,
      summary: 'Marketplace with buyer protection: a refund if the item does not arrive or is not as described',
      sourceUrl: 'https://www.aliexpress.com/p/buyerprotection/index.html'
    }
  },
  {
    domains: ['amazon.com'],
    record: {
      name: 'Amazon',
      kind: 'marketplace',
      buyerProtection: true,
      summary: 'Marketplace with the A-to-z Guarantee for orders from other sellers',
      sourceUrl: 'https://www.amazon.com/gp/help/customer/display.html?nodeId=GQ37ZCNECJKTFYQV'
    }
  }
];

export function storeRecordFor(domain: string): StoreRecord | undefined {
  const host = domain.toLowerCase().replace(/^www\./, '');
  return STORES.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`)))?.record;
}
