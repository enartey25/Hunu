import { VendorService } from './types';
import { ParsedIntent } from './queryParser';
import { conceptsFor, isModelToken, normalizeText, tokenize, withinOneEdit } from './text';

/**
 * Field-weighted lexical relevance.
 *
 * Each query token is looked up in every field of a listing. A token scores by the best
 * field it appears in (the name counts most) and by how it matched (exact, prefix, a
 * related concept, or a one-letter typo). Tokens are weighted by how rare they are in
 * the candidate pool, and model numbers count extra, so "arduino uno r3" ranks the
 * listing that says R3 above one that only says Arduino.
 */

interface IndexedField {
  weight: number;
  tokens: Set<string>;
}

interface IndexedVendor {
  fields: IndexedField[];
  all: Set<string>;
  nameText: string;
}

const FIELD_WEIGHTS = {
  name: 1.0,
  features: 0.7,
  category: 0.6,
  summary: 0.55,
  tier: 0.45,
  meta: 0.3
};

const indexCache = new WeakMap<VendorService, IndexedVendor>();

function indexVendor(vendor: VendorService): IndexedVendor {
  const cached = indexCache.get(vendor);
  if (cached) return cached;

  const field = (weight: number, text: string): IndexedField => ({ weight, tokens: new Set(tokenize(text)) });
  const fields = [
    field(FIELD_WEIGHTS.name, vendor.name),
    field(FIELD_WEIGHTS.features, vendor.keyFeatures.join(' ')),
    field(FIELD_WEIGHTS.category, vendor.category),
    field(FIELD_WEIGHTS.summary, vendor.summary),
    field(FIELD_WEIGHTS.tier, `${vendor.pricing.startingTierLabel} ${vendor.pricing.studentDiscountNote || ''}`),
    field(
      FIELD_WEIGHTS.meta,
      [
        ...vendor.targetIndustries,
        ...vendor.complianceCertifications,
        vendor.location.city,
        vendor.location.stateOrRegion,
        vendor.location.country
      ].join(' ')
    )
  ];
  const all = new Set<string>();
  for (const f of fields) for (const t of f.tokens) all.add(t);

  const indexed = { fields, all, nameText: ` ${normalizeText(vendor.name)} ` };
  indexCache.set(vendor, indexed);
  return indexed;
}

/** How well one query token matches one listing token: 1 exact, lower for looser matches, 0 for none. */
function matchQuality(queryToken: string, docTokens: Set<string>): number {
  if (docTokens.has(queryToken)) return 1;

  let best = 0;
  const model = isModelToken(queryToken);
  for (const doc of docTokens) {
    // Prefix either way: "solder" ~ "soldering", "stm32" ~ "stm32f103".
    if (queryToken.length >= 4 && doc.startsWith(queryToken)) best = Math.max(best, 0.85);
    else if (doc.length >= 4 && queryToken.startsWith(doc)) best = Math.max(best, model ? 0.6 : 0.7);
    // Typos, for words long enough that one edit is unlikely to be a different word.
    else if (!model && queryToken.length >= 5 && !/\d/.test(doc) && withinOneEdit(queryToken, doc)) {
      best = Math.max(best, 0.75);
    }
    if (best >= 0.85) break;
  }
  if (best > 0) return best;

  for (const concept of conceptsFor(queryToken)) {
    if (docTokens.has(concept)) return 0.5;
  }
  return 0;
}

function tokenScore(queryToken: string, indexed: IndexedVendor): number {
  let best = 0;
  for (const f of indexed.fields) {
    if (f.weight <= best) continue;
    const q = matchQuality(queryToken, f.tokens);
    if (q > 0) best = Math.max(best, f.weight * q);
  }
  return best;
}

export interface RelevanceResult {
  /** 0 to 1. */
  score: number;
  /** Query tokens found in the listing. */
  matched: string[];
  /** Query tokens not found. */
  missing: string[];
  /** True when every query token appears in the listing's name. */
  nameMatch: boolean;
}

export interface RelevanceContext {
  tokens: string[];
  weights: Map<string, number>;
  phrase: string;
  parsed: ParsedIntent;
}

/** Prepares token weights for a query against the pool it will be ranked in. */
export function buildRelevanceContext(parsed: ParsedIntent, pool: VendorService[]): RelevanceContext {
  const tokens = parsed.tokens;
  const weights = new Map<string, number>();
  const n = Math.max(1, pool.length);

  for (const token of tokens) {
    let df = 0;
    for (const vendor of pool) {
      if (matchQuality(token, indexVendor(vendor).all) >= 0.7) df++;
    }
    // Rare tokens distinguish listings; a token nobody carries cannot, so it is discounted
    // rather than allowed to sink every result.
    let weight = df === 0 ? 0.6 : 1 + Math.log(1 + n / df) / Math.log(1 + n);
    if (isModelToken(token)) weight *= 1.4;
    weights.set(token, weight);
  }

  return { tokens, weights, phrase: tokens.length > 1 ? ` ${normalizeText(parsed.coreQuery)} ` : '', parsed };
}

export function scoreRelevance(vendor: VendorService, ctx: RelevanceContext): RelevanceResult {
  const hint = vendor.relevanceHint ?? 0;
  if (ctx.tokens.length === 0) {
    return { score: 1, matched: [], missing: [], nameMatch: false };
  }

  const indexed = indexVendor(vendor);
  const matched: string[] = [];
  const missing: string[] = [];
  let sum = 0;
  let total = 0;
  let nameHits = 0;

  for (const token of ctx.tokens) {
    const weight = ctx.weights.get(token) ?? 1;
    const s = tokenScore(token, indexed);
    total += weight;
    sum += weight * s;
    if (s > 0) matched.push(token);
    else missing.push(token);
    if (matchQuality(token, indexed.fields[0].tokens) >= 0.85) nameHits++;
  }

  let score = total > 0 ? sum / total : 0;
  const nameMatch = nameHits === ctx.tokens.length;

  // The exact phrase in the name is the strongest signal there is.
  if (ctx.phrase && indexed.nameText.includes(ctx.phrase)) score += 0.15;
  else if (nameMatch && ctx.tokens.length > 1) score += 0.08;

  // A confident category match nudges, but never rescues a listing with no matching words.
  if (score > 0 && ctx.parsed.category === vendor.category && ctx.parsed.categoryConfidence >= 0.6) {
    score += 0.06;
  }

  // "Case for Arduino Uno" names the product only to say what it fits. When every query
  // word in the name comes after "for" or "compatible with", the listing is an accessory.
  if (matched.length > 0 && !ctx.parsed.tokens.includes('for')) {
    const fits = indexed.nameText.search(/ (for|compatible with|fits|to suit) /);
    if (fits > 0) {
      const lead = indexed.nameText.slice(0, fits);
      const leadTokens = new Set(tokenize(lead));
      const subjectBefore = ctx.tokens.some((t) => matchQuality(t, leadTokens) >= 0.7);
      if (!subjectBefore && leadTokens.size > 0) score *= 0.55;
    }
  }

  // A named model that the listing does not carry is very likely a different product.
  // That only holds for a listing of one product. A distributor's catalogue entry never
  // names individual models, so it is not penalised for leaving one out.
  const isListing = vendor.dataSource === 'web' || vendor.dataSource === 'page';
  const missingModel = missing.some(isModelToken);
  if (isListing && missingModel && matched.length > 0) score *= 0.6;

  score = Math.max(Math.min(1, score), hint);
  return { score, matched, missing, nameMatch };
}

/** Minimum relevance for a listing to be shown at all. */
export const RELEVANCE_FLOOR = 0.2;
