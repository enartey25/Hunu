/**
 * The Trust score: how far a buyer can trust an offer, from four records and Hunu's own
 * checks.
 *
 *   product      the product's rating and reviews on the store
 *   seller       what the platform publishes about the seller (rating, verified ID, years)
 *                and what Hunu users said after buying from them
 *   store        the store's returns and buyer protection
 *   hunu users   confirmations and reports on prices and pins other buyers shared
 *   checks       a price too good to be true, out of stock, a stale quote, a paid ad
 *
 * Each record that has evidence gets a score; the Trust score is their weighted mean.
 * A record with no evidence is left out rather than counted as bad, and an offer with no
 * evidence at all is "not enough to go on", not "untrustworthy".
 */
import { VendorService } from './types';
import { extractDomain } from './urlResolver';
import { StoreRecord, storeRecordFor } from './storeTrust';
import { QUOTE_STALE_DAYS } from './quote';

export type TrustLevel = 'trusted' | 'ok' | 'caution' | 'risky' | 'unknown';
export type TrustGroup = 'product' | 'seller' | 'store' | 'hunu users' | 'checks';

export interface TrustSignal {
  group: TrustGroup;
  label: string;
  effect: 'good' | 'bad' | 'neutral';
  sourceUrl?: string;
}

export interface TrustAssessment {
  /** 0 to 100; undefined when there is not enough to go on. */
  score?: number;
  level: TrustLevel;
  signals: TrustSignal[];
  /** One line telling the buyer what to do. */
  advice: string;
}

/** What Hunu users said about a seller after buying. */
export interface SellerRatingSummary {
  average: number;
  count: number;
  notes?: string[];
}

export interface TrustContext {
  /** The price is far below comparable offers. */
  suspiciouslyCheap?: boolean;
  /** Ratings from Hunu users for this seller, when any. */
  hunuRatings?: SellerRatingSummary;
  now?: number;
}

export const TRUST_LABEL: Record<TrustLevel, string> = {
  trusted: 'Trusted',
  ok: 'Fair',
  caution: 'Caution',
  risky: 'Risky',
  unknown: 'Not enough to go on'
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Stars to 0-100, after pulling a thin rating toward 4.0 the way the ranking always has. */
function starsScore(rating: number, count: number, priorWeight: number): number {
  const adjusted = (count * rating + priorWeight * 4.0) / (count + priorWeight);
  return clamp(((adjusted - 2.5) / 2.5) * 100);
}

/** How much a group's evidence counts, from how much of it there is. */
const confidence = (count: number, full: number) => Math.min(1, 0.3 + Math.log10(1 + count) / Math.log10(1 + full) * 0.7);

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A stable key for a seller, so ratings from Hunu users land on the same seller each
 * time. Undefined for rows that are not a seller someone can rate (a page being viewed,
 * a catalogue company, the buyer's own unshared pin).
 */
export function sellerKey(vendor: VendorService): string | undefined {
  const id = vendor.id;
  if (id.startsWith('osm-local-')) return `osm:${id.slice('osm-local-'.length)}`;
  if (vendor.dataSource === 'pinned') return vendor.communityShop ? `pin:${vendor.communityShop.id}` : undefined;
  const domain = extractDomain(vendor.exactOrderUrl || vendor.websiteUrl || '');
  if (vendor.dataSource === 'web' && domain) {
    if (vendor.seller?.platformId) return `${domain.split('.')[0]}:${vendor.seller.platformId}`;
    if (vendor.seller?.name) return `${domain}:${norm(vendor.seller.name)}`;
    return `store:${domain}`;
  }
  if ((vendor.dataSource === 'quote' || vendor.dataSource === 'community') && vendor.seller?.name) {
    return `name:${norm(vendor.seller.name)}|${norm(vendor.location.city || '')}`;
  }
  return undefined;
}

export function assessTrust(vendor: VendorService, context: TrustContext = {}): TrustAssessment {
  const now = context.now ?? Date.now();
  const signals: TrustSignal[] = [];
  const groups: { weight: number; score: number }[] = [];
  const domain = extractDomain(vendor.exactOrderUrl || vendor.websiteUrl || '');
  const store: StoreRecord | undefined = domain ? storeRecordFor(domain) : undefined;

  // --- Product -------------------------------------------------------------------
  if (vendor.ratingKnown !== false && vendor.rating > 0 && vendor.reviewsCount > 0) {
    const s = starsScore(vendor.rating, vendor.reviewsCount, 20);
    groups.push({ weight: 0.3 * confidence(vendor.reviewsCount, 500), score: s });
    signals.push({
      group: 'product',
      label: `Rated ${vendor.rating.toFixed(1)} from ${vendor.reviewsCount.toLocaleString()} ${vendor.reviewsCount === 1 ? 'review' : 'reviews'}`,
      effect: s >= 60 ? 'good' : s < 40 ? 'bad' : 'neutral'
    });
  }

  // --- Seller --------------------------------------------------------------------
  const seller = vendor.seller;
  let sellerScore: number | undefined;
  let sellerEvidence = 0;
  if (seller?.officialStore) {
    sellerScore = 90;
    sellerEvidence += 3;
    signals.push({ group: 'seller', label: 'The brand’s official store', effect: 'good' });
  }
  if (seller?.rating !== undefined) {
    const s = starsScore(seller.rating, seller.ratingCount ?? 5, 5);
    sellerScore = sellerScore === undefined ? s : (sellerScore + s) / 2;
    sellerEvidence += 1;
    signals.push({
      group: 'seller',
      label: `Seller rated ${seller.rating.toFixed(1)} by buyers on ${store?.name || domain || 'the site'}`,
      effect: seller.rating >= 4.3 ? 'good' : seller.rating < 3.5 ? 'bad' : 'neutral'
    });
  }
  if (seller?.verifiedId) {
    sellerScore = (sellerScore ?? 55) + 10;
    sellerEvidence += 1;
    signals.push({ group: 'seller', label: 'The site checked the seller’s ID', effect: 'good' });
  }
  if (seller?.yearsActive !== undefined) {
    sellerEvidence += 1;
    if (seller.yearsActive >= 1) {
      sellerScore = (sellerScore ?? 55) + Math.min(15, seller.yearsActive * 4);
      signals.push({ group: 'seller', label: `${seller.yearsActive}+ ${seller.yearsActive === 1 ? 'year' : 'years'} selling on ${store?.name || 'the site'}`, effect: 'good' });
    } else {
      sellerScore = (sellerScore ?? 55) - 15;
      signals.push({ group: 'seller', label: 'New seller: less than a year on the site', effect: 'bad' });
    }
  }
  const hunu = context.hunuRatings;
  if (hunu && hunu.count > 0) {
    const s = starsScore(hunu.average, hunu.count, 3);
    sellerScore = sellerScore === undefined ? s : (sellerScore * sellerEvidence + s * Math.min(4, hunu.count)) / (sellerEvidence + Math.min(4, hunu.count));
    sellerEvidence += hunu.count;
    signals.push({
      group: 'hunu users',
      label: `Rated ${hunu.average.toFixed(1)} by ${hunu.count} Hunu ${hunu.count === 1 ? 'buyer' : 'buyers'}`,
      effect: hunu.average >= 4 ? 'good' : hunu.average < 3 ? 'bad' : 'neutral'
    });
  }
  if (sellerScore !== undefined) groups.push({ weight: 0.4 * confidence(sellerEvidence, 10), score: clamp(sellerScore) });

  // --- Store ---------------------------------------------------------------------
  if (store) {
    const s = store.kind === 'classifieds' ? 35 : store.buyerProtection ? 80 : store.returnsDays ? (store.exchangeOnly ? 62 : 72) : 55;
    groups.push({ weight: 0.2, score: s });
    signals.push({
      group: 'store',
      label: store.summary,
      effect: s >= 60 ? 'good' : s < 45 ? 'bad' : 'neutral',
      sourceUrl: store.sourceUrl
    });
  }

  // --- Hunu users: shared prices and pins -----------------------------------------
  const shared = vendor.communityReport || vendor.communityShop;
  if (shared) {
    if (shared.confirmations > 0) {
      groups.push({ weight: 0.15, score: clamp(60 + shared.confirmations * 10) });
      signals.push({
        group: 'hunu users',
        label: `Confirmed by ${shared.confirmations} other ${shared.confirmations === 1 ? 'buyer' : 'buyers'}`,
        effect: 'good'
      });
    } else {
      signals.push({ group: 'hunu users', label: 'Shared by one buyer, not confirmed yet', effect: 'neutral' });
    }
  }

  // --- Checks --------------------------------------------------------------------
  let penalty = 0;
  if (context.suspiciouslyCheap) {
    penalty += store?.kind === 'classifieds' ? 35 : 20;
    signals.push({ group: 'checks', label: 'Price far below every other offer: often a different item, or a scam', effect: 'bad' });
  }
  if (vendor.availability === 'out_of_stock') {
    penalty += 10;
    signals.push({ group: 'checks', label: 'Listed as out of stock', effect: 'bad' });
  }
  if (vendor.quotedAt && !vendor.communityReport && (now - vendor.quotedAt) / 86_400_000 > QUOTE_STALE_DAYS) {
    signals.push({ group: 'checks', label: 'This quote is over a month old', effect: 'neutral' });
  }
  if (seller?.paidPlacement) {
    signals.push({ group: 'checks', label: 'Paid ad: its position was bought, which says nothing about the seller', effect: 'neutral' });
  }
  if (vendor.dataSource === 'local' || vendor.dataSource === 'pinned') {
    signals.push({ group: 'checks', label: 'A walk-in shop: you see the item before you pay', effect: 'good' });
  }

  // --- Score, level and advice -----------------------------------------------------
  const totalWeight = groups.reduce((a, g) => a + g.weight, 0);
  let score = totalWeight > 0 ? clamp(groups.reduce((a, g) => a + g.weight * g.score, 0) / totalWeight - penalty) : undefined;
  let level: TrustLevel =
    score === undefined ? 'unknown' : score >= 75 ? 'trusted' : score >= 55 ? 'ok' : score >= 35 ? 'caution' : 'risky';
  // A warning is never hidden behind "not enough to go on", and a too-good price is never "trusted".
  if (context.suspiciouslyCheap) {
    if (level === 'unknown' || level === 'trusted' || level === 'ok') level = store?.kind === 'classifieds' ? 'risky' : 'caution';
    if (score !== undefined) score = Math.min(score, level === 'risky' ? 34 : 54);
  }

  const advice =
    context.suspiciouslyCheap
      ? 'Too good to be true? Check it is the same item, and pay only when it is in your hands.'
      : store?.advice
      ? store.advice
      : level === 'trusted'
      ? 'Good record. Still check the item when it arrives.'
      : level === 'ok'
      ? 'A fair record. Know the returns policy before you pay.'
      : level === 'caution'
      ? 'Mixed record. Pay on delivery or in person if you can.'
      : level === 'risky'
      ? 'Poor record. We would walk away from this one.'
      : vendor.dataSource === 'local' || vendor.dataSource === 'pinned' || vendor.dataSource === 'quote'
      ? 'Nobody has rated this seller yet. Look the item over in the shop before you pay.'
      : 'Nobody has rated this seller yet. Pay on delivery where you can.';

  return { score, level, signals, advice };
}
