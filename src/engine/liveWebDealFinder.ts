import { parseB2BSearchQuery } from './queryParser';
import { findDiscount, findPromoCode, tokenOverlap } from './priceParser';
import { contentTokens, containsPhrase, tokenize } from './text';
import { searchWeb, IssueReporter } from './liveWebScraper';

export interface LiveWebDeal {
  id: string;
  vendorName: string;
  dealTitle: string;
  dealDescription: string;
  discountPercent?: number;
  discountFixedUSD?: number;
  promoCode?: string;
  claimUrl: string;
  source: string;
  audience: 'student' | 'business' | 'supply_chain' | 'all';
  /**
   * True only for programmes checked by hand against the provider's own page.
   * A discount read off the open web is false: it is shown, never applied to a price.
   */
  verified: boolean;
  foundAt: string;
  /** Domain of the seller the deal belongs to, when known. Deals attach to sellers by this. */
  vendorDomain?: string;
  /** Stemmed words that must all appear in a seller's name for a curated deal to attach. */
  brandTokens?: string[];
  /** Words and phrases that make a curated deal relevant to a search. */
  keywords?: string[];
}

const VERIFIED_B2B_AND_STUDENT_DEALS: LiveWebDeal[] = [
  {
    id: 'deal-github-pack',
    vendorName: 'GitHub Student Developer Pack',
    dealTitle: 'Free GitHub Pro, Copilot, JetBrains, and $200 Cloud Credits',
    dealDescription: 'Official GitHub Education program providing free developer tools, cloud hosting credits, and GitHub Pro to enrolled university students.',
    discountPercent: 100,
    claimUrl: 'https://education.github.com/pack',
    source: 'Official GitHub Education Portal',
    audience: 'student',
    verified: true,
    foundAt: 'Official Portal',
    vendorDomain: 'education.github.com',
    brandTokens: ['github'],
    keywords: ['github', 'student pack', 'developer pack', 'copilot', 'jetbrains', 'student software', 'free software', 'cloud credits']
  },
  {
    id: 'deal-notion-edu',
    vendorName: 'Notion for Education',
    dealTitle: 'Free Notion Plus Plan for Students & Educators ($120/yr value)',
    dealDescription: 'Official Notion education program offering free Notion Plus with unlimited blocks and file uploads to students using university email.',
    discountPercent: 100,
    claimUrl: 'https://www.notion.so/product/notion-for-education',
    source: 'Official Notion Education Portal',
    audience: 'student',
    verified: true,
    foundAt: 'Official Portal',
    vendorDomain: 'notion.so',
    brandTokens: ['notion'],
    keywords: ['notion', 'notes app', 'student software', 'free software']
  },
  {
    id: 'deal-qatar-student',
    vendorName: 'Qatar Airways Student Club',
    dealTitle: '10-20% Tiered Fare Discounts + +10kg Baggage Allowance',
    dealDescription: 'Official airline loyalty club offering verified students 10% off first flight, 15% off second, 20% off third, and extra luggage allowance.',
    discountPercent: 20,
    claimUrl: 'https://www.qatarairways.com/en/student-club.html',
    source: 'Official Qatar Airways Student Club',
    audience: 'student',
    verified: true,
    foundAt: 'Official Portal',
    vendorDomain: 'qatarairways.com',
    brandTokens: ['qatar'],
    keywords: ['qatar', 'flight', 'airfare', 'airline', 'student travel', 'baggage']
  },
  {
    id: 'deal-emirates-student',
    vendorName: 'Emirates student fares',
    dealTitle: 'Students: extra 10 kg or one extra bag',
    dealDescription:
      'Emirates gives students an extra 10 kg, or one extra piece, of checked baggage. Not on journeys to or from the US and Canada. From 1 Oct 2026 it costs USD 50 on Saver fares. Register as a student before booking.',
    claimUrl: 'https://www.emirates.com/us/english/special-offers/student-special-fares/',
    source: "Emirates' student offers page (checked 2026-11-16)",
    audience: 'student',
    verified: true,
    foundAt: 'Official Portal',
    vendorDomain: 'emirates.com',
    brandTokens: ['emirate'],
    keywords: ['emirates', 'flight', 'airfare', 'airline', 'student travel', 'baggage']
  },
  {
    id: 'deal-doordash-student',
    vendorName: 'DoorDash DashPass for Students',
    dealTitle: '50% Off DashPass Student Membership ($4.99/mo)',
    dealDescription: 'Official DoorDash student rate with $0 delivery fees and reduced service fees on eligible campus food orders.',
    discountPercent: 50,
    claimUrl: 'https://www.doordash.com/dashpass/student/',
    source: 'Official DoorDash Student Plan',
    audience: 'student',
    verified: true,
    foundAt: 'Official Portal',
    vendorDomain: 'doordash.com',
    brandTokens: ['doordash'],
    keywords: ['doordash', 'dashpass', 'food delivery', 'campus food', 'takeout']
  },
  {
    id: 'deal-too-good-to-go',
    vendorName: 'Too Good To Go Surplus Meals & Grocery Deals',
    dealTitle: 'Up to 70% Off Surplus Restaurant Meals & Fresh Groceries Nearby',
    dealDescription: 'Official marketplace app to purchase surplus meals from restaurants, bakeries, and markets at roughly one-third of retail price.',
    discountPercent: 70,
    claimUrl: 'https://toogoodtogo.com',
    source: 'Official Too Good To Go App',
    audience: 'all',
    verified: true,
    foundAt: 'Official Portal',
    vendorDomain: 'toogoodtogo.com',
    brandTokens: ['too', 'good', 'go'],
    keywords: ['too good to go', 'surplus', 'meal', 'grocery', 'food', 'cheap food']
  },
  {
    id: 'deal-studentuniverse-flights',
    vendorName: 'StudentUniverse Verified Student Flights',
    dealTitle: 'Negotiated Airline Student Fares on International Flights',
    dealDescription: 'Direct student agency negotiated rates on commercial airlines for verified university students.',
    claimUrl: 'https://www.studentuniverse.com',
    source: 'Official StudentUniverse Booking',
    audience: 'student',
    verified: true,
    foundAt: 'Official Portal',
    vendorDomain: 'studentuniverse.com',
    brandTokens: ['studentuniverse'],
    keywords: ['studentuniverse', 'student universe', 'flight', 'airfare', 'student travel']
  }
];

/** Every hand-checked programme. Used to label catalogue sellers before any search is typed. */
export function getCuratedDeals(): LiveWebDeal[] {
  return VERIFIED_B2B_AND_STUDENT_DEALS;
}

/** Curated programmes relevant to a search, by whole-word keyword match. */
export function matchCuratedDeals(query: string): LiveWebDeal[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return VERIFIED_B2B_AND_STUDENT_DEALS.filter((deal) =>
    (deal.keywords || []).some((kw) => containsPhrase(tokens, kw))
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Sites that list other shops' codes. Their domain says nothing about who honours the
 * deal, and their codes are mostly expired, so they are never reported as a seller's deal.
 */
const COUPON_AGGREGATOR = /coupon|promo|voucher|deal|discount|cashback|saving|retailmenot|groupon|honey|wethrift|knoji|rakuten|simplycodes|capitaloneshopping|cuponation/i;

export interface DealSearchOptions {
  signal?: AbortSignal;
  /** Search the web for current discounts as well as matching the curated list. Default true. */
  live?: boolean;
  onIssue?: IssueReporter;
}

/**
 * Finds discounts for a product or seller.
 *
 * Curated programmes are matched by keyword. Live discounts come from a web search for
 * the query plus "discount": a result becomes a deal only when its own text states a
 * percentage off or a promo code and is about the thing searched for. Live deals are
 * marked unverified and tied to the domain that published them, so they attach only to
 * that seller's row and never change a computed price.
 */
export async function searchLiveWebDeals(
  query: string,
  vendorName?: string,
  options: DealSearchOptions = {}
): Promise<LiveWebDeal[]> {
  const searchTerm = (vendorName || query || '').trim();
  if (!searchTerm) return [];

  const deals: LiveWebDeal[] = [...matchCuratedDeals(searchTerm)];
  if (options.live === false) return deals;

  const parsed = parseB2BSearchQuery(searchTerm);
  const tokens = parsed.tokens.length > 0 ? parsed.tokens : contentTokens(searchTerm);
  if (tokens.length === 0) return deals;

  try {
    const q = `${parsed.coreQuery || searchTerm} discount offer`;
    const hits = await searchWeb(q, options.signal, options.onIssue);
    {
      const seenDomains = new Set(deals.map((d) => d.vendorDomain));
      for (const hit of hits) {
        const text = `${hit.title}. ${hit.snippet}`;
        if (tokenOverlap(tokens, text) < 0.5) continue;
        const discount = findDiscount(text);
        const code = findPromoCode(text);
        if (!discount && !code) continue;
        if (COUPON_AGGREGATOR.test(hit.domain)) continue;
        if (seenDomains.has(hit.domain)) continue;
        seenDomains.add(hit.domain);

        deals.push({
          id: `live-web-${hit.domain}`,
          vendorName: hit.domain,
          dealTitle: discount
            ? `${discount.upTo ? 'Up to ' : ''}${discount.percent}% off mentioned on ${hit.domain}`
            : `Promo code mentioned on ${hit.domain}`,
          dealDescription: hit.snippet.slice(0, 200) || hit.title,
          discountPercent: discount?.percent,
          promoCode: code,
          claimUrl: hit.url,
          source: hit.domain,
          audience: 'all',
          verified: false,
          foundAt: 'Web search',
          vendorDomain: domainOf(hit.url)
        });
        if (deals.length >= 8) break;
      }
    }
  } catch (err) {
    console.warn('[Hunu] Live deal search failed:', err);
  }

  return deals;
}
