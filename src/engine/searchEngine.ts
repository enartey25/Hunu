import {
  CompanyProfile,
  ScoredVendorResult,
  SearchFilterOptions,
  VendorService,
  isOneOffPurchase,
  isPriceKnown,
  isRatingKnown
} from './types';
import { calculateAnnualCost, calculateLocationScore, scoreVendor, ScoringContext } from './scoring';
import { calculateShippingEstimate } from './shippingCalculator';
import { SEED_VENDORS } from './vendorDatabase';
import { parseB2BSearchQuery } from './queryParser';
import { LiveWebDeal } from './liveWebDealFinder';
import { buildRelevanceContext, scoreRelevance, RELEVANCE_FLOOR, RelevanceResult } from './relevance';
import { contentTokens } from './text';
import { extractDomain } from './urlResolver';
import { SellerRatingSummary, sellerKey } from './trust';
import { accessoryQuery, markAccessories } from './accessories';

const SEED_IDS = new Set(SEED_VENDORS.map((v) => v.id));

/** The ranked offers, and how many accessories the search turned up (hidden unless asked for). */
export type RankedResults = ScoredVendorResult[] & { accessoryCount: number };

/** A store listing's own title: its name without the "(Store)" Hunu adds. */
function listingTitle(vendor: VendorService): string {
  return vendor.name.replace(/\s*\([^()]*\)\s*$/, '');
}

/**
 * The live listings that are cases, chargers or other add-ons to the product searched
 * for. Prices other sellers, Hunu users and quotes put on the product itself help
 * decide; only store listings are ever treated as accessories.
 */
function findAccessories(rows: { vendor: VendorService }[], queryTokens: string[]): Set<VendorService> {
  const query = accessoryQuery(queryTokens);
  const found = new Set<VendorService>();
  if (!query.active) return found;
  const items = rows
    .map((r) => r.vendor)
    .filter(
      (v) =>
        v.dataSource === 'web' ||
        ((v.dataSource === 'page' || v.dataSource === 'community' || v.dataSource === 'quote') && isOneOffPurchase(v))
    )
    .map((v) => ({
      vendor: v,
      title: v.dataSource === 'web' ? listingTitle(v) : '',
      priceUSD: isPriceKnown(v) && v.pricing.baseMonthlyCost > 0 ? v.pricing.baseMonthlyCost : undefined
    }));
  const marks = markAccessories(items, query);
  items.forEach((item, i) => {
    if (marks[i] && item.vendor.dataSource === 'web') found.add(item.vendor);
  });
  return found;
}

/** Fewest priced, comparable offers needed before "typical price" means anything. */
const MIN_PEERS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Pairs a deal with the seller it belongs to. A deal is matched by the seller's domain
 * when it has one, otherwise by its distinctive name words all appearing in the seller's
 * name. A deal named after the search itself ("arduino") never attaches to every seller
 * that happens to stock the product.
 */
export function findDealForVendor(vendor: VendorService, deals: LiveWebDeal[]): LiveWebDeal | undefined {
  if (deals.length === 0) return undefined;
  const vendorDomain = extractDomain(vendor.exactOrderUrl || vendor.websiteUrl);
  const vendorTokens = new Set(contentTokens(vendor.name));

  let best: LiveWebDeal | undefined;
  let bestScore = 0;
  for (const deal of deals) {
    let score = 0;
    const dealDomain = deal.vendorDomain || '';
    if (dealDomain && vendorDomain && (vendorDomain === dealDomain || vendorDomain.endsWith(`.${dealDomain}`))) {
      score = deal.verified ? 3 : 2;
    } else if (deal.verified) {
      // Curated programmes are matched by name: every brand word must be present.
      const brand = (deal.brandTokens && deal.brandTokens.length > 0
        ? deal.brandTokens
        : contentTokens(deal.vendorName).slice(0, 2)
      ).filter(Boolean);
      if (brand.length > 0 && brand.every((t) => vendorTokens.has(t))) score = 2.5;
    }
    if (score > bestScore) {
      bestScore = score;
      best = deal;
    }
  }
  return best;
}

function toActiveDeal(deal: LiveWebDeal | undefined): ScoredVendorResult['activeDeal'] {
  if (!deal) return undefined;
  return {
    title: deal.dealTitle,
    description: deal.dealDescription,
    discountPercent: deal.discountPercent,
    discountFixedUSD: deal.discountFixedUSD,
    promoCode: deal.promoCode,
    claimUrl: deal.claimUrl,
    source: deal.source,
    verified: deal.verified
  };
}

/** Same offer reached twice (two search variants, or a saved quote that is also live). */
function dedupeKey(vendor: VendorService): string {
  const url = (vendor.exactOrderUrl || vendor.websiteUrl || '').toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  return url && vendor.dataSource === 'web' ? url : vendor.id;
}

export function searchAndRankVendors(
  profile: CompanyProfile,
  filters: SearchFilterOptions = {},
  vendorPool: VendorService[] = SEED_VENDORS,
  liveDeals: LiveWebDeal[] = [],
  /** Ratings from Hunu users, keyed by `sellerKey`. */
  sellerRatings?: Map<string, SellerRatingSummary>
): RankedResults {
  const query = (filters.query || '').trim();
  const parsed = query ? parseB2BSearchQuery(query) : null;
  const hasQuery = !!parsed && parsed.tokens.length > 0;

  // An explicit category choice is a hard filter. A category guessed from the words is
  // only used to exclude when the guess is confident; otherwise it is a ranking nudge.
  const explicitCategory = filters.category && filters.category !== 'All' ? filters.category : undefined;
  const inferredCategory =
    !explicitCategory && parsed?.category && parsed.categoryConfidence >= 0.9 ? parsed.category : undefined;

  const effectiveAudience = filters.targetAudience || (profile.userRole === 'student' ? 'student' : 'all');

  // --- 1. Hard filters --------------------------------------------------------------
  const seen = new Set<string>();
  const candidates = vendorPool.filter((vendor) => {
    const key = dedupeKey(vendor);
    if (seen.has(key)) return false;
    seen.add(key);

    if (!hasQuery && effectiveAudience !== 'all' && vendor.targetAudience && vendor.targetAudience.length > 0) {
      if (!vendor.targetAudience.includes(effectiveAudience as 'student' | 'business' | 'supply_chain')) {
        return false;
      }
    }

    if (explicitCategory && vendor.category !== explicitCategory) return false;

    // Live rows were fetched for this very search, so a guessed category must not drop them.
    if (
      inferredCategory &&
      vendor.category !== inferredCategory &&
      vendor.category !== 'General Products & Retail' &&
      (vendor.dataSource === undefined || vendor.dataSource === 'catalogue')
    ) {
      return false;
    }

    if (filters.minRating && (!isRatingKnown(vendor) || vendor.rating < filters.minRating)) {
      return false;
    }

    if (
      filters.contractPreference &&
      filters.contractPreference !== 'any' &&
      vendor.pricing.contractTerm !== filters.contractPreference &&
      vendor.pricing.contractTerm !== 'flexible'
    ) {
      return false;
    }

    if (filters.requiredCertifications && filters.requiredCertifications.length > 0) {
      const hasAllCerts = filters.requiredCertifications.every((cert) =>
        vendor.complianceCertifications.some((c) => c.toLowerCase().includes(cert.toLowerCase()))
      );
      if (!hasAllCerts) return false;
    }

    return true;
  });

  // --- 2. Relevance -----------------------------------------------------------------
  let relevant: { vendor: VendorService; relevance?: RelevanceResult }[];
  if (hasQuery && parsed) {
    const ctx = buildRelevanceContext(parsed, candidates);
    relevant = candidates
      .map((vendor) => ({ vendor, relevance: scoreRelevance(vendor, ctx) }))
      .filter((r) => r.relevance.score >= RELEVANCE_FLOOR);
  } else {
    relevant = candidates.map((vendor) => ({ vendor }));
  }

  // --- 2b. Accessories --------------------------------------------------------------
  // "iphone 15" matches "iPhone 15 Case" word for word. Add-ons are never peers of the
  // product, and are left out of the list unless the buyer asks to see them.
  const accessories = hasQuery ? findAccessories(relevant, parsed!.tokens) : new Set<VendorService>();
  const accessoryCount = accessories.size;
  if (accessoryCount > 0 && !filters.includeAccessories) {
    relevant = relevant.filter((r) => !accessories.has(r.vendor));
  }

  // --- 3. Typical price among comparable offers ---------------------------------------
  // Only one-off purchases that match the search well are peers of one another: a monthly
  // service and a single item are not comparable, and neither is a loosely related listing.
  const isStudent = profile.userRole === 'student';
  const landedOf = (vendor: VendorService): number => {
    const { distanceKm } = calculateLocationScore(vendor, profile);
    const ship = calculateShippingEstimate(vendor, distanceKm, profile.location).estimatedCostUSD;
    return calculateAnnualCost(vendor, profile.headcount, isStudent) + ship;
  };

  let peerReferenceCost: number | undefined;
  let peerCount = 0;
  const peerLanded = new Map<VendorService, number>();
  if (hasQuery) {
    for (const { vendor, relevance } of relevant) {
      if (
        relevance &&
        relevance.score >= 0.5 &&
        !accessories.has(vendor) &&
        isOneOffPurchase(vendor) &&
        isPriceKnown(vendor) &&
        vendor.pricing.baseMonthlyCost > 0 &&
        vendor.dataSource !== undefined &&
        vendor.dataSource !== 'catalogue'
      ) {
        peerLanded.set(vendor, landedOf(vendor));
      }
    }
    if (peerLanded.size >= MIN_PEERS) {
      peerReferenceCost = median([...peerLanded.values()]);
      peerCount = peerLanded.size;
    }
  }
  // Shipping can hide a tiny item price, so the "is this even the same item" check uses
  // the price before shipping.
  const peerItemMedian =
    peerLanded.size >= 4 ? median([...peerLanded.keys()].map((v) => v.pricing.baseMonthlyCost)) : undefined;

  // --- 4. Score ---------------------------------------------------------------------
  const scored = relevant.map(({ vendor, relevance }) => {
    const context: ScoringContext = {};
    if (relevance) context.relevance = relevance.score;
    // A catalogue distributor's price is a typical order, not the price of the product
    // being searched for, so in a product search it is not scored as one.
    if (
      hasQuery &&
      parsed!.intents.includes('product') &&
      isOneOffPurchase(vendor) &&
      vendor.pricing.baseMonthlyCost > 0 &&
      (vendor.dataSource === 'catalogue' || (vendor.dataSource === undefined && SEED_IDS.has(vendor.id)))
    ) {
      context.priceIsNotForThisItem = true;
    }
    if (sellerRatings && sellerRatings.size > 0) {
      const key = sellerKey(vendor);
      const ratings = key ? sellerRatings.get(key) : undefined;
      if (ratings) context.hunuRatings = ratings;
    }
    const landed = peerLanded.get(vendor);
    if (peerReferenceCost !== undefined && landed !== undefined) {
      context.peerReferenceCost = peerReferenceCost;
      context.peerCount = peerCount;
      // A listing at a fraction of everyone else's price is usually an accessory or a part.
      context.suspiciouslyCheap =
        peerItemMedian !== undefined && vendor.pricing.baseMonthlyCost < peerItemMedian * 0.3;
    }
    const result = scoreVendor(vendor, profile, toActiveDeal(findDealForVendor(vendor, liveDeals)), context);
    if (accessories.has(vendor)) result.accessory = true;
    return result;
  });

  // --- 5. Result filters --------------------------------------------------------------
  let results = scored;

  if (filters.maxDistanceKm && filters.maxDistanceKm > 0) {
    results = results.filter((item) => {
      if (item.vendor.serviceType === 'digital_remote') return true;
      if (item.breakdown.distanceKm !== undefined) {
        return item.breakdown.distanceKm <= filters.maxDistanceKm!;
      }
      return true;
    });
  }

  if (filters.maxMonthlyBudget && filters.maxMonthlyBudget > 0) {
    const maxAnnual = filters.maxMonthlyBudget * 12;
    results = results.filter(
      (item) => !isPriceKnown(item.vendor) || item.roiEstimate.annualCostEst <= maxAnnual
    );
  }

  // "under $50" in the search itself: drop priced one-off offers clearly over it.
  if (parsed?.maxPriceUSD) {
    const ceiling = parsed.maxPriceUSD * 1.1;
    results = results.filter(
      (item) =>
        !isOneOffPurchase(item.vendor) ||
        !isPriceKnown(item.vendor) ||
        item.roiEstimate.annualCostEst <= ceiling
    );
  }

  // --- 6. Sort ------------------------------------------------------------------------
  const sortBy = filters.sortBy || 'value_score';
  const byValue = (a: ScoredVendorResult, b: ScoredVendorResult) =>
    b.totalValueScore - a.totalValueScore ||
    (b.breakdown.relevanceScore ?? 0) - (a.breakdown.relevanceScore ?? 0) ||
    a.totalLandedCost - b.totalLandedCost;

  results.sort((a, b) => {
    switch (sortBy) {
      case 'price_asc': {
        // Offers without a price cannot be "cheapest": they go last.
        const ka = isPriceKnown(a.vendor) ? 0 : 1;
        const kb = isPriceKnown(b.vendor) ? 0 : 1;
        return ka - kb || a.totalLandedCost - b.totalLandedCost || byValue(a, b);
      }
      case 'distance_asc': {
        const distA = a.breakdown.distanceKm ?? 99999;
        const distB = b.breakdown.distanceKm ?? 99999;
        return distA - distB || b.breakdown.locationScore - a.breakdown.locationScore || byValue(a, b);
      }
      case 'rating_desc': {
        const ra = isRatingKnown(a.vendor) ? a.breakdown.qualityScore : -1;
        const rb = isRatingKnown(b.vendor) ? b.breakdown.qualityScore : -1;
        return rb - ra || byValue(a, b);
      }
      default:
        return byValue(a, b);
    }
  });

  return Object.assign(results, { accessoryCount });
}
