/**
 * Ranking the offer on the page being viewed against the market: turning the page
 * into a row that can be scored, the search that finds its competitors, and the
 * verdict shown once both are ranked together.
 */
import { CompanyProfile, ScoredVendorResult, SearchFilterOptions, ServiceCategory, VendorService } from './types';
import { ExtractedPageDeal } from '../content/pageDealExtractor';
import { countryTld } from './scoring';
import { deliveryUncertain } from './deliveryText';

export const PAGE_DEAL_ID = 'active-page-deal-item';

/**
 * The search that finds the same product elsewhere. A page title carries the shop's
 * name, colours and marketing; stores match best on the first few words.
 */
export function queryFromTitle(title: string): string {
  const head = title
    .replace(/\.{3}$|…$/, '')
    .replace(/[([{][^)\]}]*[)\]}]?/g, ' ')
    .split(/\s+[|–—]\s+|\s+-\s+|,|:/)[0];
  const words = head
    .split(/\s+/)
    .filter((w) => w && !/^(brand|new|original|genuine|official|authentic|sealed|latest)$/i.test(w))
    .slice(0, 6);
  return words.join(' ') || title.trim();
}

/** The page's offer as a row the ranking can score. */
export function pageDealToVendor(
  deal: ExtractedPageDeal,
  category: ServiceCategory,
  profile: CompanyProfile
): VendorService {
  const tld = countryTld(profile.location.country);
  const domestic = !!tld && (deal.domain.endsWith(`.${tld}`) || deal.domain.includes(`.${tld}.`));
  const features = [`Found on ${deal.domain}`, `Price on the page: ${deal.priceText}`];
  if (deal.discountPercent && deal.listPriceText) {
    features.push(`Was ${deal.listPriceText} (${deal.discountPercent}% off)`);
  }

  return {
    id: PAGE_DEAL_ID,
    name: `${deal.title} (this page)`,
    category,
    serviceType: 'hybrid',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: {
      city: 'Online',
      stateOrRegion: deal.domain,
      country: domestic ? profile.location.country : 'International',
      latitude: 0,
      longitude: 0,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: deal.priceUSD ?? 0,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: deal.priceText || 'Price on the page',
      contractTerm: 'per_item'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10', '11-50'],
    complianceCertifications: [],
    rating: 0,
    reviewsCount: 0,
    slaGuarantee: `Checkout on ${deal.domain}`,
    summary: deal.description || `The offer on the page you have open, at ${deal.domain}.`,
    keyFeatures: features,
    websiteUrl: deal.url,
    exactOrderUrl: deal.url,
    dataSource: 'page',
    priceKnown: deal.priceUSD !== undefined,
    priceSource: 'page',
    ratingKnown: false,
    locationKnown: false,
    listPriceUSD: deal.listPriceUSD,
    discountPercent: deal.discountPercent,
    // The page the user chose to rank always belongs in its own comparison.
    relevanceHint: 1,
    matchBasis: 'The offer on the page you have open'
  };
}

/** What the buyer chose to rank by. */
export type RankCriterion = NonNullable<SearchFilterOptions['sortBy']>;

export const CRITERION_LABEL: Record<RankCriterion, string> = {
  value_score: 'best value',
  price_asc: 'lowest price',
  distance_asc: 'nearest',
  rating_desc: 'top rated'
};

/** What is being judged: the offer on the open page, or a price a seller quoted the buyer. */
export type VerdictSubject = 'page' | 'quote';

export interface PageVerdict {
  subject: VerdictSubject;
  /** The page's value score, 0 to 100. */
  score: number;
  /** What the page was judged on. */
  criterion: RankCriterion;
  /** Its position on that criterion among everything ranked with it, starting at 1. */
  rank: number;
  total: number;
  headline: string;
  detail: string;
  /** Offers that beat the page on that criterion, best first. */
  better: ScoredVendorResult[];
}

const landed = (r: ScoredVendorResult) => r.totalLandedCost ?? r.roiEstimate.annualCostEst;
const priced = (r: ScoredVendorResult) => r.vendor.priceKnown !== false && r.vendor.pricing.baseMonthlyCost > 0;
const rated = (r: ScoredVendorResult) => r.vendor.ratingKnown !== false && r.vendor.rating > 0;
const pick = (lines: string[], seed: number) => lines[Math.abs(seed) % lines.length];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Whether `other` beats `page` on the buyer's criterion. Strict, and only on what is
 * actually known: an offer with no price is never "cheaper", one with no rating never
 * "better rated", and a web shop with no known address is "nearer" only when it trades
 * in the buyer's country and the page does not.
 */
function beats(other: ScoredVendorResult, page: ScoredVendorResult, criterion: RankCriterion): boolean {
  switch (criterion) {
    case 'price_asc':
      return priced(other) && priced(page) && landed(other) < landed(page);
    case 'distance_asc': {
      const a = other.breakdown.distanceKm;
      const b = page.breakdown.distanceKm;
      if (a !== undefined && b !== undefined) return a < b;
      if (a !== undefined) return true;
      if (b !== undefined) return false;
      return other.breakdown.locationScore > page.breakdown.locationScore;
    }
    case 'rating_desc':
      return rated(other) && (!rated(page) || other.breakdown.qualityScore > page.breakdown.qualityScore);
    default:
      return priced(other) && other.totalValueScore > page.totalValueScore;
  }
}

/**
 * How the page's offer stands against the offers ranked with it, on the criterion the
 * buyer chose. `results` must already be sorted by that criterion. Undefined until the
 * page has been ranked.
 */
export function judgePageDeal(
  results: ScoredVendorResult[],
  criterion: RankCriterion = 'value_score',
  pageId: string = PAGE_DEAL_ID,
  subject: VerdictSubject = 'page'
): PageVerdict | undefined {
  const page = results.find((r) => r.vendor.id === pageId);
  if (!page) return undefined;

  const quoted = subject === 'quote';
  const score = page.totalValueScore;
  const others = results.filter((r) => r.vendor.id !== pageId);
  const ahead = others.filter((r) => beats(r, page, criterion));
  const better = ahead.slice(0, 3);
  const base = { subject, score, criterion, rank: ahead.length + 1, total: results.length, better };
  const seed = score + page.vendor.name.length;
  // A buyer at a counter is bargaining, not hovering over a checkout button.
  const walkAway = quoted
    ? ['Keep your money in your pocket for now.', 'Your wallet would like a word.', 'Smile, say thank you, and keep walking.']
    : ['Step away from the checkout button.', 'Your wallet would like a word.', 'This one is priced for someone in a hurry.'];
  const doBetter = quoted
    ? ['Bargain harder. You can do better.', 'Hold that thought. There is room to haggle.', 'Not bad, but do not shake on it just yet.']
    : ['We think you can do better.', 'Hold that thought. There are better deals.', 'Not bad, but do not settle just yet.'];

  if (others.length === 0) {
    return { ...base, headline: 'Nothing to compare it with yet.', detail: 'We found no other offers for this, so the score stands alone.' };
  }

  // What cannot be judged is said plainly rather than guessed.
  if ((criterion === 'value_score' || criterion === 'price_asc') && !priced(page)) {
    const withPrice = others.filter(priced);
    return {
      ...base,
      better: criterion === 'price_asc' ? withPrice.slice(0, 3) : better,
      headline: `No price on this ${subject}, so we are judging with one eye closed.`,
      detail: `${plural(withPrice.length, 'other offer states', 'other offers state')} a price.`
    };
  }

  if (ahead.length === 0) {
    const best: Record<RankCriterion, string[]> = {
      value_score: quoted
        ? ['Shake on it. We looked, and nothing beats this.', 'That seller was not lying. This is the one to beat.', 'Go on then. We could not do better.']
        : ['Nice find. We looked, and nothing beats this.', 'You got here first. This is the one to beat.', 'Go on then. We could not do better.'],
      price_asc: quoted
        ? ['Cheapest we could find. Shake on it.', 'Nobody online undercuts this. Nice haggling.']
        : ['Cheapest we could find. Go on then.', 'Nobody undercuts this. Nice find.'],
      distance_asc: ['Nothing we found is closer to you.', 'This is as near as it gets.'],
      rating_desc: ['Nobody we found is better rated.', 'Top marks. Nothing outranks this.']
    };
    return { ...base, headline: pick(best[criterion], seed), detail: `First of ${results.length} offers by ${CRITERION_LABEL[criterion]}.` };
  }

  if (criterion === 'price_asc') {
    const saving = Math.round((1 - landed(ahead[0]) / landed(page)) * 100);
    return {
      ...base,
      headline: saving >= 25
        ? pick(walkAway.slice(0, 2), seed)
        : saving >= 5
        ? pick(quoted ? doBetter.slice(0, 2) : ['We think you can do better.', 'Hold that thought. It is cheaper elsewhere.'], seed)
        : 'Close call. Someone is cheaper, but only just.',
      detail: `${plural(ahead.length, 'offer is', 'offers are')} cheaper, delivered. The cheapest is ${
        deliveryUncertain(ahead[0]) || deliveryUncertain(page) ? 'about ' : ''
      }${Math.max(saving, 1)}% less${deliveryUncertain(ahead[0]) ? ', with delivery estimated' : ''}.`
    };
  }

  if (criterion === 'distance_asc') {
    const nearest = ahead[0].breakdown.distanceKm;
    return {
      ...base,
      headline: pick(['You can get this closer to home.', 'Why wait for shipping? There are nearer sellers.'], seed),
      detail:
        nearest !== undefined
          ? `${plural(ahead.length, 'seller is', 'sellers are')} nearer. The closest is ${nearest.toLocaleString()} km away.`
          : `${plural(ahead.length, 'seller trades', 'sellers trade')} in your country; this ${subject} does not appear to.`
    };
  }

  if (criterion === 'rating_desc') {
    return {
      ...base,
      headline: rated(page)
        ? pick(['Buyers like other sellers more.', 'Decent, but others are better reviewed.'], seed)
        : quoted
        ? 'A quote comes with no reviews, so trust is on you.'
        : 'This page publishes no rating, so trust is on you.',
      detail: `${plural(ahead.length, 'seller has', 'sellers have')} a ${rated(page) ? 'better' : 'published'} rating.`
    };
  }

  // Best value: how much cheaper the cheapest better offer is, delivered.
  const cheapest = better.reduce((a, b) => (landed(b) < landed(a) ? b : a));
  const saving = Math.round((1 - landed(cheapest) / landed(page)) * 100);
  const approx = deliveryUncertain(cheapest) || deliveryUncertain(page) ? 'about ' : '';
  const savingNote = saving >= 3 ? ` The cheapest of them is ${approx}${saving}% less, delivered.` : '';
  const gap = better[0].totalValueScore - score;

  let headline: string;
  if (gap <= 4) {
    headline = pick(['Close call. This is nearly as good as it gets.', 'A photo finish, but it is not quite first.', 'Decent. A little shopping around could still pay.'], seed);
  } else if (score < 45) {
    headline = pick(walkAway, seed);
  } else {
    headline = pick(doBetter, seed);
  }

  return { ...base, headline, detail: `${plural(ahead.length, 'deal scores', 'deals score')} higher.${savingNote}` };
}
