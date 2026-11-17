import {
  CompanyProfile,
  HeadcountRange,
  PriceConfidence,
  ROIEstimate,
  ScoreBreakdown,
  ScoredVendorResult,
  VendorService,
  isOneOffPurchase,
  isPriceKnown,
  isRatingKnown
} from './types';
import { calculateHaversineDistanceKm } from './distance';
import { calculateShippingEstimate } from './shippingCalculator';
import { communityNote, quoteAgeNote } from './quote';
import { SellerRatingSummary, TRUST_LABEL, assessTrust } from './trust';

function getEstimatedHeadcountCount(headcount: HeadcountRange, isStudent: boolean = false): number {
  if (isStudent) return 1;
  switch (headcount) {
    case '1-10':
      return 5;
    case '11-50':
      return 25;
    case '51-200':
      return 100;
    case '201-1000':
      return 450;
    case '1000+':
      return 1200;
    default:
      return 20;
  }
}

const CATEGORY_ANNUAL_BENCHMARKS: Record<string, number> = {
  'Accounting & Tax': 8500,
  'Legal & Compliance': 12000,
  'Payroll & HR': 4500,
  'Cloud Infrastructure & DevOps': 18000,
  '3PL Warehousing & Logistics': 7200,
  'Supply Chain & Bulk Freight': 16000,
  'Lab Components & Hardware': 350,
  'Student Flights & Travel': 1200,
  'Student Software & Offers': 400,
  'Food & Campus Dining': 600,
  'Enterprise Cybersecurity': 14000,
  'B2B Marketing & Sales': 24000,
  'Facilities & Commercial Equipment': 15000
};

/**
 * The fallback yardstick when there are no comparable offers to measure against.
 * Recurring services use the annual figure. A one-off purchase uses one month of it,
 * which is the size of a typical single order in that category. A category with no
 * figure (general retail, where a pen and a laptop share nothing) has no benchmark.
 */
export function categoryBenchmark(vendor: VendorService): number | undefined {
  const annual = CATEGORY_ANNUAL_BENCHMARKS[vendor.category];
  if (!annual) return undefined;
  return isOneOffPurchase(vendor) ? Math.round(annual / 12) : annual;
}

/**
 * What the buyer pays before shipping: the price of the item for a one-off purchase,
 * or twelve months of the service for a recurring one.
 */
export function calculateAnnualCost(
  vendor: VendorService,
  headcount: HeadcountRange,
  isStudent: boolean = false
): number {
  const seats = getEstimatedHeadcountCount(headcount, isStudent);
  const { baseMonthlyCost, pricingModel } = vendor.pricing;

  if (isOneOffPurchase(vendor)) {
    return Math.round(baseMonthlyCost * 100) / 100;
  }

  let monthlyTCO = 0;
  if (pricingModel === 'per_user') {
    monthlyTCO = baseMonthlyCost * seats;
  } else if (pricingModel === 'per_unit') {
    monthlyTCO = baseMonthlyCost * (isStudent ? 1 : Math.min(20, seats));
  } else if (pricingModel === 'tiered') {
    const scaleFactor = seats > 200 ? 3.0 : seats > 50 ? 1.8 : 1.0;
    monthlyTCO = baseMonthlyCost * scaleFactor;
  } else {
    monthlyTCO = baseMonthlyCost;
  }

  return Math.round(monthlyTCO * 12);
}

/** ccTLD of the user's country, used to tell a domestic web shop from a foreign one. */
const COUNTRY_TLDS: Record<string, string> = {
  ghana: 'gh',
  nigeria: 'ng',
  kenya: 'ke',
  'south africa': 'za',
  'united kingdom': 'uk',
  germany: 'de',
  france: 'fr',
  canada: 'ca',
  australia: 'au',
  india: 'in',
  ireland: 'ie',
  netherlands: 'nl',
  spain: 'es',
  italy: 'it',
  japan: 'jp',
  singapore: 'sg',
  china: 'cn',
  'united arab emirates': 'ae',
  brazil: 'br',
  mexico: 'mx',
  uganda: 'ug',
  tanzania: 'tz',
  rwanda: 'rw',
  senegal: 'sn',
  egypt: 'eg',
  morocco: 'ma'
};

export function countryTld(country: string): string | undefined {
  return COUNTRY_TLDS[(country || '').trim().toLowerCase()];
}

export function calculateLocationScore(
  vendor: VendorService,
  profile: CompanyProfile
): { score: number; distanceKm?: number } {
  const isSameCountry =
    !!vendor.location.country &&
    vendor.location.country.toLowerCase() === profile.location.country.toLowerCase();

  // A web listing whose warehouse is unknown: no distance is claimed. A shop on the
  // buyer's own country domain is treated as domestic; anything else is neutral.
  if (vendor.locationKnown === false) {
    return { score: isSameCountry ? 88 : 60 };
  }

  const distanceKm = calculateHaversineDistanceKm(
    profile.location.latitude,
    profile.location.longitude,
    vendor.location.latitude,
    vendor.location.longitude
  );

  if (vendor.serviceType === 'digital_remote') {
    if (isSameCountry) return { score: 96, distanceKm };
    return { score: 88, distanceKm };
  }

  if (vendor.serviceType === 'hybrid') {
    if (distanceKm <= 100) return { score: 100, distanceKm };
    if (distanceKm <= 350) return { score: 90, distanceKm };
    if (distanceKm <= 1200) return { score: 78, distanceKm };
    if (isSameCountry) return { score: 70, distanceKm };
    return { score: 45, distanceKm };
  }

  // Local physical services: a smooth falloff inside a city, then bands.
  if (distanceKm <= 50) return { score: Math.round(100 - distanceKm * 0.24), distanceKm };
  if (distanceKm <= 150) return { score: 82, distanceKm };
  if (distanceKm <= 500) return { score: 65, distanceKm };
  if (vendor.location.serviceRadiusKm && distanceKm <= vendor.location.serviceRadiusKm) {
    return { score: 55, distanceKm };
  }
  return { score: 25, distanceKm };
}

/** Score given to an offer whose price could not be read: neither rewarded nor punished. */
export const UNKNOWN_PRICE_SCORE = 50;

/**
 * Maps cost relative to a reference (the median of comparable offers, or a category
 * benchmark) onto 0 - 100. Continuous, so two offers a dollar apart never land a band apart.
 *   half the reference or less -> 100,  at the reference -> 75,
 *   1.5x -> 45,  2.5x or more -> 10.
 */
export function calculatePriceScore(
  cost: number,
  reference: number,
  contractTerm: string,
  preferredContract: string
): number {
  let score: number;
  if (cost <= 0) {
    score = 100;
  } else {
    const ratio = cost / Math.max(0.01, reference);
    if (ratio <= 0.5) score = 100;
    else if (ratio <= 1) score = 100 - (ratio - 0.5) * 50;
    else if (ratio <= 1.5) score = 75 - (ratio - 1) * 60;
    else if (ratio <= 2.5) score = 45 - (ratio - 1.5) * 35;
    else score = 10;
  }

  if (preferredContract !== 'any' && contractTerm === preferredContract) {
    score = Math.min(100, score + 6);
  }
  return Math.round(score);
}

export function calculateFitScore(
  vendor: VendorService,
  profile: CompanyProfile
): number {
  let score = 0;

  if (profile.userRole === 'student') {
    const isStudentTargeted = vendor.targetAudience?.includes('student');
    score += isStudentTargeted ? 60 : 25;

    if (vendor.pricing.studentDiscountNote) {
      score += 25;
    }

    if (profile.budgetTier === 'Bootstrap') {
      score += 15;
    } else {
      score += 10;
    }
    return Math.min(100, score);
  }

  // Business / Supply Chain Fit
  const matchesIndustry =
    vendor.targetIndustries.includes('All') ||
    vendor.targetIndustries.some(
      (ind) => ind.toLowerCase() === profile.industry.toLowerCase()
    );

  score += matchesIndustry ? 50 : 20;

  const matchesHeadcount = vendor.targetHeadcount.includes(profile.headcount);
  score += matchesHeadcount ? 35 : 15;

  if (profile.budgetTier === 'Bootstrap' && vendor.pricing.contractTerm !== 'annual') {
    score += 15;
  } else if (profile.budgetTier === 'Enterprise' && vendor.complianceCertifications.length >= 2) {
    score += 15;
  } else {
    score += 10;
  }

  return Math.min(100, score);
}

/** Prior used to temper ratings backed by few reviews: 50 imaginary reviews at 4.0 stars. */
const RATING_PRIOR_MEAN = 4.0;
const RATING_PRIOR_WEIGHT = 50;

/**
 * Quality from what the seller actually publishes.
 * A rating is pulled toward 4.0 until enough reviews back it, so 5.0 from 3 reviews
 * does not outrank 4.7 from 4,000. A seller with no published rating gets a neutral
 * score instead of an invented one.
 */
export function calculateQualityScore(vendor: VendorService): number {
  const certPoints = Math.min(15, vendor.complianceCertifications.length * 5);

  if (!isRatingKnown(vendor) || vendor.rating <= 0) {
    const stock = vendor.availability === 'out_of_stock' ? -15 : vendor.availability === 'in_stock' ? 5 : 0;
    return Math.max(0, Math.min(100, 50 + certPoints + stock));
  }

  const n = Math.max(0, vendor.reviewsCount);
  const adjusted =
    (n * vendor.rating + RATING_PRIOR_WEIGHT * RATING_PRIOR_MEAN) / (n + RATING_PRIOR_WEIGHT);
  // 3.0 stars -> 0, 5.0 stars -> 70.
  const ratingPoints = Math.max(0, Math.min(70, ((adjusted - 3) / 2) * 70));
  // Review volume on a log scale: 10 -> 5, 100 -> 10, 1,000+ -> 15.
  const volumePoints = Math.min(15, Math.log10(1 + n) * 5);
  const stock = vendor.availability === 'out_of_stock' ? -15 : 0;

  return Math.max(0, Math.min(100, Math.round(ratingPoints + volumePoints + certPoints + stock)));
}

export function priceConfidenceOf(vendor: VendorService): PriceConfidence {
  if (!isPriceKnown(vendor)) return 'unknown';
  if (vendor.priceSource === 'page') return 'live';
  if (vendor.priceSource === 'snippet') return 'snippet';
  if (vendor.priceSource === 'quote' || vendor.dataSource === 'quote') return 'quote';
  if (vendor.dataSource === 'page') return 'live';
  return 'catalogue';
}

function generateBadges(
  vendor: VendorService,
  breakdown: ScoreBreakdown,
  roi: ROIEstimate,
  totalScore: number,
  priceKnown: boolean,
  priceBasis: 'peers' | 'benchmark' | 'none'
): string[] {
  const badges: string[] = [];

  if (vendor.availability === 'out_of_stock') {
    badges.push('Out of stock');
  }

  if (totalScore >= 88 && priceKnown) {
    badges.push('Best Value Pick');
  }

  if (vendor.pricing.studentDiscountNote && vendor.dataSource !== 'local') {
    badges.push('Student Discount Available');
  }

  if (priceKnown && vendor.pricing.baseMonthlyCost === 0) {
    badges.push('100% Free For Students');
  }

  if (breakdown.distanceKm !== undefined && breakdown.distanceKm <= 30) {
    badges.push('Local Near You (< 30 km)');
  } else if (breakdown.distanceKm !== undefined && breakdown.distanceKm <= 100) {
    badges.push('Regional Hub');
  }

  if (priceKnown && roi.savingsPercent >= 15 && priceBasis !== 'none') {
    badges.push(
      priceBasis === 'peers'
        ? `${roi.savingsPercent}% Below Other Offers`
        : `${roi.savingsPercent}% Below Benchmark`
    );
  }

  return badges;
}

/** Context from the result set an offer is being ranked in. All of it is optional. */
export interface ScoringContext {
  /** Typical landed cost of comparable offers for the same search. */
  peerReferenceCost?: number;
  /** How many priced offers `peerReferenceCost` was taken from. */
  peerCount?: number;
  /** Relevance of the offer to the search, 0 to 1. Absent when there is no search. */
  relevance?: number;
  /** True when the price is far below comparable offers, which usually means a different item. */
  suspiciouslyCheap?: boolean;
  /**
   * True when the seller's listed price is a typical order value rather than the price
   * of the product searched for (a distributor in the catalogue). It is then not scored
   * as if it were that product's price.
   */
  priceIsNotForThisItem?: boolean;
  /** What Hunu users said about this seller after buying, when any. */
  hunuRatings?: SellerRatingSummary;
}

export function scoreVendor(
  vendor: VendorService,
  profile: CompanyProfile,
  activeDeal?: ScoredVendorResult['activeDeal'],
  context: ScoringContext = {}
): ScoredVendorResult {
  const isStudent = profile.userRole === 'student';
  const priceKnown = isPriceKnown(vendor);
  const baseCost = calculateAnnualCost(vendor, profile.headcount, isStudent);

  // Only a verified discount changes the price. One read off the open web is shown, not applied.
  let finalCost = baseCost;
  const dealApplies = !!activeDeal && activeDeal.verified !== false && priceKnown;
  if (dealApplies && activeDeal) {
    if (activeDeal.discountPercent && activeDeal.discountPercent > 0) {
      finalCost = Math.round(baseCost * (1 - activeDeal.discountPercent / 100) * 100) / 100;
    } else if (activeDeal.discountFixedUSD && activeDeal.discountFixedUSD > 0) {
      finalCost = Math.max(0, baseCost - activeDeal.discountFixedUSD);
    }
    if (!isOneOffPurchase(vendor)) finalCost = Math.round(finalCost);
  }

  const { score: locationScore, distanceKm } = calculateLocationScore(vendor, profile);
  const shippingEstimate = calculateShippingEstimate(vendor, distanceKm, profile.location);
  const totalLandedCost = Math.round((finalCost + shippingEstimate.estimatedCostUSD) * 100) / 100;

  // What the price is measured against: other offers for the same search when there are
  // enough of them, otherwise the category benchmark, otherwise nothing.
  const benchmark = categoryBenchmark(vendor);
  let reference: number | undefined;
  let priceBasis: 'peers' | 'benchmark' | 'none' = 'none';
  if (context.peerReferenceCost && context.peerReferenceCost > 0) {
    reference = context.peerReferenceCost;
    priceBasis = 'peers';
  } else if (benchmark && vendor.dataSource !== 'web' && vendor.dataSource !== 'page') {
    // A category benchmark describes a seller's typical order, not the price of one
    // specific product, so it is never used to judge a single live listing.
    reference = benchmark;
    priceBasis = 'benchmark';
  }

  // Peers are compared on landed cost; a benchmark is a pre-shipping figure.
  const compareCost = priceBasis === 'peers' ? totalLandedCost : finalCost;

  let priceScore: number;
  if (!priceKnown) {
    priceScore = UNKNOWN_PRICE_SCORE;
    priceBasis = 'none';
    reference = undefined;
  } else if (context.suspiciouslyCheap) {
    priceScore = 60;
  } else if (context.priceIsNotForThisItem) {
    priceScore = 65;
    priceBasis = 'none';
    reference = undefined;
  } else if (reference === undefined) {
    priceScore = totalLandedCost <= 0 ? 100 : 65;
  } else {
    priceScore = calculatePriceScore(
      compareCost,
      reference,
      vendor.pricing.contractTerm,
      profile.preferredContract
    );
  }

  const savingsVsAvg =
    reference !== undefined ? Math.max(0, Math.round((reference - compareCost) * 100) / 100) : 0;
  const savingsPercent =
    reference !== undefined && reference > 0 ? Math.round((savingsVsAvg / reference) * 100) : 0;

  const roiEstimate: ROIEstimate = {
    annualCostEst: finalCost,
    industryAvgAnnualCost: reference ?? finalCost,
    estimatedSavingsVsAvg: savingsVsAvg,
    savingsPercent
  };

  const fitScore = calculateFitScore(vendor, profile);
  // Quality is the Trust score where there is evidence, so the ranking and the badge agree.
  const trust = assessTrust(vendor, { suspiciouslyCheap: context.suspiciouslyCheap, hunuRatings: context.hunuRatings });
  const qualityScore = trust.score ?? calculateQualityScore(vendor);

  const breakdown: ScoreBreakdown = {
    priceScore,
    locationScore,
    fitScore,
    qualityScore,
    distanceKm
  };
  if (context.relevance !== undefined) {
    breakdown.relevanceScore = Math.round(context.relevance * 100);
  }

  const weights = profile.priorityWeights;
  const totalWeight =
    weights.priceWeight +
    weights.locationWeight +
    weights.fitWeight +
    weights.qualityWeight;

  const normalizedTotalWeight = totalWeight > 0 ? totalWeight : 1;

  const weightedSum =
    priceScore * weights.priceWeight +
    locationScore * weights.locationWeight +
    fitScore * weights.fitWeight +
    qualityScore * weights.qualityWeight;

  let value = weightedSum / normalizedTotalWeight;

  // A deal on the wrong product is not a deal: value is scaled by how well the offer
  // matches the search. A perfect match keeps its score; a weak one loses up to 60%.
  if (context.relevance !== undefined) {
    value *= 0.4 + 0.6 * context.relevance;
  }
  // Offers that cannot be fully checked rank below ones that can.
  const priceConfidence = priceConfidenceOf(vendor);
  if (priceConfidence === 'unknown') value *= 0.9;
  if (vendor.availability === 'out_of_stock') value *= 0.75;

  const totalValueScore = Math.min(100, Math.max(0, Math.round(value)));

  const badges = generateBadges(vendor, breakdown, roiEstimate, totalValueScore, priceKnown, priceBasis);

  if (shippingEstimate.isFreeShipping && shippingEstimate.estimatedCostUSD === 0 && vendor.serviceType !== 'digital_remote') {
    badges.unshift(`Free Delivery to ${profile.location.city}`);
  }

  if (activeDeal) {
    const unverified = activeDeal.verified === false;
    if (activeDeal.discountPercent) {
      badges.unshift(
        unverified
          ? `Possible ${activeDeal.discountPercent}% Off (unverified)`
          : `${activeDeal.discountPercent}% Off Web Deal`
      );
    } else if (activeDeal.discountFixedUSD) {
      badges.unshift(`$${activeDeal.discountFixedUSD.toLocaleString()} Web Credit`);
    } else {
      badges.unshift('Active Web Deal');
    }
  }

  // --- Reasons: the plain-language account of the rank ------------------------------
  const reasons: string[] = [];
  if (context.relevance !== undefined) {
    if (vendor.matchBasis) reasons.push(vendor.matchBasis);
    else if (context.relevance >= 0.8) reasons.push('Closely matches your search');
    else if (context.relevance < 0.45) reasons.push('Only partly matches your search');
  }
  if (!priceKnown) {
    reasons.push('No price published, so price is scored as neutral');
  } else if (context.suspiciouslyCheap) {
    reasons.push('Priced far below the other offers: check it is the same item');
  } else if (priceBasis === 'peers' && reference !== undefined) {
    const diff = Math.round(((totalLandedCost - reference) / reference) * 100);
    const n = context.peerCount ?? 0;
    if (diff <= -5) reasons.push(`${-diff}% below the typical price of ${n} offers found`);
    else if (diff >= 5) reasons.push(`${diff}% above the typical price of ${n} offers found`);
    else reasons.push(`In line with the typical price of ${n} offers found`);
  } else if (priceBasis === 'benchmark' && savingsPercent >= 15) {
    reasons.push(`${savingsPercent}% below the category benchmark`);
  } else if (context.priceIsNotForThisItem) {
    reasons.push('Sells this kind of product; the price shown is a typical order, not this item');
  } else if (priceBasis === 'none' && context.relevance !== undefined) {
    reasons.push('Too few priced offers found to say whether this price is good');
  }
  if (priceConfidence === 'snippet') reasons.push('Price read from a search snippet: confirm on the page');
  if (priceConfidence === 'catalogue') reasons.push('Catalogue price, not a live check');
  if (vendor.communityReport && vendor.quotedAt) {
    reasons.push(communityNote(vendor.quotedAt, vendor.communityReport.confirmations));
  } else if (vendor.quotedAt) {
    reasons.push(quoteAgeNote(vendor.quotedAt));
  }
  if (distanceKm !== undefined && distanceKm <= 30 && vendor.serviceType !== 'digital_remote') {
    reasons.push(`${distanceKm} km from you`);
  }
  if (isRatingKnown(vendor) && vendor.rating >= 4.5 && vendor.reviewsCount >= 100) {
    reasons.push(`Rated ${vendor.rating.toFixed(1)} from ${vendor.reviewsCount.toLocaleString()} reviews`);
  } else if (!isRatingKnown(vendor)) {
    reasons.push('No published rating');
  }
  if (vendor.availability === 'out_of_stock') reasons.unshift('Listed as out of stock');
  if (trust.level === 'risky' || trust.level === 'caution') reasons.push(`Trust: ${TRUST_LABEL[trust.level]}. ${trust.advice}`);

  return {
    trust,
    vendor,
    totalValueScore,
    breakdown,
    badges: badges.slice(0, 3),
    roiEstimate,
    shippingEstimate,
    totalLandedCost,
    priceConfidence,
    priceBasis,
    peerCount: priceBasis === 'peers' ? context.peerCount : undefined,
    reasons,
    activeDeal
  };
}
