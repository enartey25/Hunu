import { ServiceCategory } from './types';
import { toUSD } from './currency';
import { contentTokens, containsPhrase, normalizeText, tokenize, isModelToken } from './text';

export type SearchIntent = 'product' | 'service' | 'deal' | 'supplier' | 'local' | 'alternative';

export interface ParsedIntent {
  category?: ServiceCategory;
  /** 0 to 1. Below 0.5 the category is a guess and must not be used to exclude anything. */
  categoryConfidence: number;
  detectedKeywords: string[];
  extractedLocation?: string;
  isUrgentOrSpecific: boolean;
  audienceContext?: 'student' | 'business' | 'supply_chain';
  /** What the user is after. A query can carry several: "cheap arduino supplier near me". */
  intents: SearchIntent[];
  /** The subject of the search with location, budget and filler removed: "arduino uno r3". */
  coreQuery: string;
  /** Stemmed subject tokens, in order. */
  tokens: string[];
  /** Budget ceiling in USD, from phrases like "under $50" or "below 500 cedis". */
  maxPriceUSD?: number;
  /** Quantity the user asked for, from "x10", "10 pcs", "pack of 5". */
  quantity?: number;
  /** True when the query names a specific model or part number. */
  hasModelNumber: boolean;
}

interface CategoryRule {
  category: ServiceCategory;
  audience: 'student' | 'business' | 'supply_chain';
  /** Unambiguous: one hit is enough to be confident. Brand names and multi-word phrases. */
  strong: string[];
  /** Suggestive: counts toward the category but is common in other contexts. */
  weak: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'Lab Components & Hardware',
    audience: 'student',
    strong: [
      'resistor', 'capacitor', 'microcontroller', 'stm32', 'arduino', 'raspberry pi', 'esp32',
      'esp8266', 'pcb', 'soldering', 'oscilloscope', 'multimeter', 'semiconductor', 'breadboard',
      'digikey', 'mouser', 'jlcpcb', 'adafruit', 'sparkfun', 'lab components', 'electronic components',
      'jumper wires', 'servo motor', 'stepper motor', 'transistor', 'mosfet', 'diode', 'dev board',
      'development board', 'nodemcu', 'attiny', 'atmega'
    ],
    weak: ['component', 'lab', 'circuit', 'sensor', 'electronics', 'hardware', 'module', 'relay', 'led']
  },
  {
    category: 'Student Flights & Travel',
    audience: 'student',
    strong: [
      'flight', 'airfare', 'airline', 'plane ticket', 'student travel', 'student universe',
      'studentuniverse', 'qatar airways', 'baggage allowance', 'skyscanner', 'round trip', 'one way ticket'
    ],
    weak: ['travel', 'ticket', 'trip', 'fare']
  },
  {
    category: 'Student Software & Offers',
    audience: 'student',
    strong: [
      'student pack', 'student discount', 'student offer', 'github pack', 'github student',
      'free software', 'jetbrains', 'notion student', 'notion plus', 'figma education',
      'student license', 'academic discount', 'education plan', 'student developer pack'
    ],
    weak: ['software', 'license', 'subscription', 'notion', 'figma', 'github']
  },
  {
    category: 'Food & Campus Dining',
    audience: 'student',
    strong: [
      'food deal', 'grocery', 'campus dining', 'campus food', 'doordash', 'dashpass',
      'too good to go', 'cheap food', 'takeout', 'restaurant discount', 'food delivery', 'meal plan'
    ],
    weak: ['food', 'meal', 'lunch', 'dinner', 'breakfast', 'restaurant', 'snack']
  },
  {
    category: 'Supply Chain & Bulk Freight',
    audience: 'supply_chain',
    strong: [
      'supply chain', 'freight', 'ocean freight', 'air cargo', 'shipping container', 'customs broker',
      'customs clearance', 'port drayage', 'freight forwarder', 'import export', 'flexport', 'lcl', 'fcl'
    ],
    weak: ['cargo', 'pallet', 'container', 'customs', 'logistics']
  },
  {
    category: '3PL Warehousing & Logistics',
    audience: 'supply_chain',
    strong: [
      '3pl', 'warehouse', 'warehousing', 'fulfillment', 'fulfilment', 'shipbob',
      'inventory management', 'distribution center', 'pick and pack'
    ],
    weak: ['storage', 'inventory', 'logistics']
  },
  {
    category: 'Cloud Infrastructure & DevOps',
    audience: 'business',
    strong: [
      'devops', 'kubernetes', 'k8s', 'aws', 'gcp', 'azure', 'terraform', 'ci/cd', 'cloud hosting',
      'web hosting', 'cloudflare', 'cdn', 'managed kubernetes', 'vps'
    ],
    weak: ['cloud', 'infrastructure', 'hosting', 'sysadmin']
  },
  {
    category: 'Accounting & Tax',
    audience: 'business',
    strong: [
      'accounting', 'accountant', 'cpa', 'bookkeeping', 'bookkeeper', 'r&d tax', '409a',
      'fractional cfo', 'tax preparation', 'tax filing', 'corporate tax'
    ],
    weak: ['tax', 'audit', 'finance']
  },
  {
    category: 'Legal & Compliance',
    audience: 'business',
    strong: [
      'lawyer', 'attorney', 'legal counsel', 'law firm', 'incorporation', 'intellectual property',
      'trademark', 'cooley', 'legal services', 'msa', 'dpa'
    ],
    weak: ['legal', 'counsel', 'contract', 'compliance']
  },
  {
    category: 'Payroll & HR',
    audience: 'business',
    strong: [
      'payroll', 'human resources', 'hr software', 'hr platform', 'peo', 'eor',
      'employer of record', 'contractor payment', 'gusto', 'rippling', 'deel'
    ],
    weak: ['hr', 'benefits', 'onboarding', 'workforce']
  },
  {
    category: 'Enterprise Cybersecurity',
    audience: 'business',
    strong: [
      'cybersecurity', 'soc-2', 'soc 2', 'soc2', 'hipaa', 'pci-dss', 'penetration testing',
      'pen test', 'vanta', 'arctic wolf', 'managed soc', 'zero trust'
    ],
    weak: ['security', 'firewall', 'compliance']
  }
];

const SUPPLIER_WORDS = ['supplier', 'distributor', 'wholesale', 'wholesaler', 'bulk', 'manufacturer', 'vendor', 'seller'];
const DEAL_WORDS = ['deal', 'discount', 'promo', 'coupon', 'offer', 'sale', 'cheap', 'cheapest', 'affordable', 'budget'];
const LOCAL_PHRASES = ['near me', 'nearby', 'near', 'local', 'in store', 'pickup', 'pick up', 'around'];
const ALTERNATIVE_WORDS = ['alternative', 'similar', 'instead', 'equivalent', 'replacement', 'substitute', 'vs', 'versus'];

const CURRENCY_WORDS: [RegExp, string][] = [
  [/^(?:\$|usd|dollars?)$/, 'USD'],
  [/^(?:gh₵|ghc|ghs|₵|cedis?)$/, 'GHS'],
  [/^(?:£|gbp|pounds?)$/, 'GBP'],
  [/^(?:€|eur|euros?)$/, 'EUR'],
  [/^(?:₦|ngn|naira)$/, 'NGN']
];

function currencyOf(word: string | undefined): string | undefined {
  if (!word) return undefined;
  const w = word.toLowerCase();
  return CURRENCY_WORDS.find(([re]) => re.test(w))?.[1];
}

const BUDGET_RE =
  /\b(?:under|below|less than|max(?:imum)?|up to|within|not more than|budget(?: of)?)\s*(\$|gh₵|ghc|ghs|₵|£|€|₦|usd|gbp|eur|ngn)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(dollars?|usd|cedis?|ghs|ghc|pounds?|gbp|euros?|eur|naira|ngn)?/i;

const QUANTITY_RE = /\b(?:x\s?(\d{1,5})|(\d{1,5})\s?(?:x|pcs?|pieces?|units?)|(?:pack|set|box|lot) of (\d{1,5}))\b/i;

// "in Accra", "near Legon". Stops at the next clause so "in bulk for lab" is not a place.
const LOCATION_RE = /\b(?:in|near|around|at)\s+((?:[A-Z][\w'-]*)(?:\s+[A-Z][\w'-]*){0,2})/;
const LOCATION_RE_LOOSE = /\b(?:in|near|around)\s+([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)?)\s*$/i;
const NOT_PLACES = new Set(['bulk', 'stock', 'store', 'me', 'person', 'lab', 'class', 'time', 'budget', 'sale']);

export function parseB2BSearchQuery(rawQuery: string): ParsedIntent {
  const raw = (rawQuery || '').trim();
  const clean = normalizeText(raw);
  const allTokens = tokenize(raw);

  // --- Budget -------------------------------------------------------------
  let maxPriceUSD: number | undefined;
  let working = raw;
  const budget = raw.match(BUDGET_RE);
  if (budget) {
    let amount = parseFloat(budget[2].replace(/,/g, ''));
    if (budget[3]) amount *= 1000;
    const code = currencyOf(budget[1]) || currencyOf(budget[4]) || 'USD';
    maxPriceUSD = toUSD(amount, code);
    working = working.replace(budget[0], ' ');
  }

  // --- Quantity -----------------------------------------------------------
  let quantity: number | undefined;
  const qty = working.match(QUANTITY_RE);
  if (qty) {
    const n = parseInt(qty[1] || qty[2] || qty[3], 10);
    if (n > 0) quantity = n;
    working = working.replace(qty[0], ' ');
  }

  // --- Location -----------------------------------------------------------
  let extractedLocation: string | undefined;
  const loc = working.match(LOCATION_RE) || working.match(LOCATION_RE_LOOSE);
  if (loc) {
    const place = loc[1].trim();
    const first = place.split(/\s+/)[0].toLowerCase();
    if (!NOT_PLACES.has(first)) {
      extractedLocation = place;
      working = working.replace(loc[0], ' ');
    }
  }

  // --- Category: whole-token matching, strong hits outweigh weak ones -----
  const detectedKeywords: string[] = [];
  let best: { rule: CategoryRule; score: number; strongHits: number } | undefined;
  let runnerUp = 0;

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    let strongHits = 0;
    for (const kw of rule.strong) {
      if (containsPhrase(allTokens, kw)) {
        score += kw.includes(' ') ? 3 : 2;
        strongHits++;
        detectedKeywords.push(kw);
      }
    }
    for (const kw of rule.weak) {
      if (containsPhrase(allTokens, kw)) {
        score += 1;
        detectedKeywords.push(kw);
      }
    }
    if (score === 0) continue;
    if (!best || score > best.score) {
      runnerUp = best ? best.score : runnerUp;
      best = { rule, score, strongHits };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  let category: ServiceCategory | undefined;
  let categoryConfidence = 0;
  let audienceContext: ParsedIntent['audienceContext'];
  if (best) {
    const margin = best.score - runnerUp;
    categoryConfidence = best.strongHits > 0 ? (margin >= 1 ? 0.9 : 0.6) : margin >= 1 ? 0.45 : 0.25;
    category = best.rule.category;
    audienceContext = best.rule.audience;
  }
  if (containsPhrase(allTokens, 'student')) audienceContext = 'student';

  // --- Intent -------------------------------------------------------------
  const intents: SearchIntent[] = [];
  const has = (words: string[]) => words.some((w) => containsPhrase(allTokens, w));
  if (has(SUPPLIER_WORDS)) intents.push('supplier');
  if (has(DEAL_WORDS) || maxPriceUSD !== undefined) intents.push('deal');
  if (has(LOCAL_PHRASES) || extractedLocation) intents.push('local');
  if (has(ALTERNATIVE_WORDS)) intents.push('alternative');

  const tokens = contentTokens(working);
  const hasModelNumber = tokens.some(isModelToken);
  const serviceCategory = category !== undefined && best!.rule.audience !== 'student';
  intents.push(serviceCategory && !hasModelNumber ? 'service' : 'product');

  const coreQuery = normalizeText(working)
    .split(' ')
    .filter((w) => contentTokens(w).length > 0)
    .join(' ');

  return {
    category,
    categoryConfidence,
    detectedKeywords,
    extractedLocation,
    audienceContext,
    isUrgentOrSpecific: /\b(urgent|urgently|emergency|immediate|immediately|asap|today)\b/.test(clean),
    intents,
    coreQuery: coreQuery || clean,
    tokens,
    maxPriceUSD,
    quantity,
    hasModelNumber
  };
}
