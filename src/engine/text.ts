/**
 * Text primitives shared by the query parser, the relevance scorer and the live sources.
 * Everything here works on whole tokens, never on raw substrings, so "hr" does not
 * match "chromebook" and "lab" does not match "label".
 */

export const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'i', 'in', 'is',
  'it', 'its', 'me', 'my', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were', 'will', 'with',
  'where', 'can', 'want', 'need', 'looking', 'find', 'get', 'buy', 'purchase', 'order', 'some',
  'any', 'please', 'urgent', 'urgently'
]);

/**
 * Words that say what the user wants done (find a bargain, find a seller) rather than
 * what the product is. They steer intent but are not matched against listings.
 */
export const INTENT_WORDS = new Set([
  'best', 'cheap', 'cheapest', 'affordable', 'budget', 'deal', 'deals', 'discount', 'discounts',
  'offer', 'offers', 'promo', 'coupon', 'coupons', 'sale', 'price', 'prices', 'pricing', 'cost',
  'supplier', 'suppliers', 'vendor', 'vendors', 'seller', 'sellers', 'distributor', 'distributors',
  'wholesale', 'wholesaler', 'wholesalers', 'bulk', 'manufacturer', 'manufacturers', 'store',
  'stores', 'shop', 'shops', 'near', 'nearby', 'local', 'online', 'alternative', 'alternatives',
  'similar', 'vs', 'versus', 'compare', 'comparison', 'review', 'reviews', 'top'
]);

/** Lowercases, strips accents and reduces punctuation to spaces, keeping characters that occur in part numbers. */
export function normalizeText(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&amp;/g, '&')
    // Sellers write a hardware revision three ways: "R3", "Rev3", "Rev. 3". Treat them as one.
    .replace(/\brev(?:ision)?\.?\s?(\d{1,2})\b/g, 'r$1')
    .replace(/[^a-z0-9+#.\-\s]/g, ' ')
    .replace(/(^|\s)[.\-]+|[.\-]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A light stemmer: plural endings only, so product names and part numbers stay intact. */
export function stem(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token;
  if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
  if (token.endsWith('sses')) return token.slice(0, -2);
  if (/(ches|shes|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us') && !token.endsWith('is')) {
    return token.slice(0, -1);
  }
  return token;
}

/** Splits text into stemmed tokens. Hyphenated and dotted terms also yield their parts ("soc-2" -> soc-2, soc, 2). */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  for (const raw of normalizeText(input).split(' ')) {
    if (!raw) continue;
    out.push(stem(raw));
    if (/[.\-]/.test(raw)) {
      for (const part of raw.split(/[.\-]/)) {
        if (part) out.push(stem(part));
      }
    }
  }
  return out;
}

/** Tokens that carry the subject of a search: no stop words, no intent words. */
export function contentTokens(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of normalizeText(input).split(' ')) {
    if (!raw || STOP_WORDS.has(raw) || INTENT_WORDS.has(raw)) continue;
    const token = stem(raw);
    if (token.length < 2 && !/\d/.test(token)) continue;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

/** A token that looks like a model or part number ("stm32f103", "rtx4060", "r3"). */
export function isModelToken(token: string): boolean {
  return /\d/.test(token) && /[a-z]/.test(token) && token.length >= 2;
}

/** True when `phrase` occurs in `text` on token boundaries. Both sides are stemmed. */
export function containsPhrase(textTokens: string[], phrase: string): boolean {
  const needle = normalizeText(phrase).split(' ').filter(Boolean).map(stem);
  if (needle.length === 0) return false;
  outer: for (let i = 0; i + needle.length <= textTokens.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (textTokens[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** True when the two strings are within one edit (insert, delete, substitute or adjacent swap). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * Concepts a query word implies. A listing that never says "resistor" but sells
 * "passives" and "components" is still a place to buy one. Kept deliberately small:
 * each entry maps a specific thing to the broader words sellers use for it.
 */
const CONCEPTS: Record<string, string[]> = {
  resistor: ['passive', 'component'],
  capacitor: ['passive', 'component'],
  inductor: ['passive', 'component'],
  diode: ['semiconductor', 'component'],
  transistor: ['semiconductor', 'component'],
  mosfet: ['semiconductor', 'component'],
  led: ['component', 'semiconductor'],
  ic: ['semiconductor', 'component'],
  chip: ['semiconductor', 'component'],
  microcontroller: ['mcu', 'development', 'semiconductor'],
  mcu: ['microcontroller', 'semiconductor'],
  esp32: ['microcontroller', 'development'],
  esp8266: ['microcontroller', 'development'],
  breadboard: ['prototyping', 'component'],
  multimeter: ['test', 'oscilloscope'],
  oscilloscope: ['test', 'multimeter'],
  flight: ['airfare', 'airline', 'fare'],
  airfare: ['flight', 'fare'],
  ticket: ['fare', 'flight'],
  plane: ['flight', 'airline'],
  grocery: ['food', 'meal'],
  meal: ['food'],
  lunch: ['food', 'meal'],
  dinner: ['food', 'meal'],
  restaurant: ['food', 'meal'],
  takeout: ['food', 'delivery'],
  freight: ['cargo', 'shipping'],
  cargo: ['freight', 'shipping'],
  container: ['freight', 'ocean'],
  warehouse: ['fulfillment', '3pl', 'warehousing'],
  warehousing: ['fulfillment', '3pl', 'warehouse'],
  fulfillment: ['warehouse', '3pl'],
  payroll: ['hr', 'workforce'],
  bookkeeper: ['bookkeeping', 'accounting'],
  accountant: ['accounting', 'bookkeeping', 'cpa'],
  accounting: ['bookkeeping', 'cpa'],
  hosting: ['cloud', 'infrastructure'],
  cdn: ['edge', 'network'],
  ddos: ['security', 'firewall']
};

export function conceptsFor(token: string): string[] {
  return CONCEPTS[token] || [];
}

/** Strips tags and decodes the entities that actually occur in search result markup. */
export function htmlToText(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}
