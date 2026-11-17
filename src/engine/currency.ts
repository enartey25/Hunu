import { fetchText } from './net';

export type SupportedCurrency = 'USD' | 'GHS' | 'GBP' | 'EUR';

export interface CurrencyConfig {
  code: SupportedCurrency;
  symbol: string;
  rateToUSD: number; // How many units of currency per 1 USD
  name: string;
}

/**
 * The display currencies. `rateToUSD` starts at a reference rate and is replaced by
 * the day's rate once `loadLiveRates` has run.
 */
export const SUPPORTED_CURRENCIES: Record<SupportedCurrency, CurrencyConfig> = {
  USD: { code: 'USD', symbol: '$', rateToUSD: 1.0, name: 'US Dollar' },
  GHS: { code: 'GHS', symbol: 'GH₵', rateToUSD: 11.76, name: 'Ghanaian Cedi' },
  GBP: { code: 'GBP', symbol: '£', rateToUSD: 0.76, name: 'British Pound' },
  EUR: { code: 'EUR', symbol: '€', rateToUSD: 0.91, name: 'Euro' }
};

/**
 * Converts a USD amount to the selected currency and formats it cleanly.
 */
export function formatCurrencyAmount(
  amountInUSD: number,
  currencyCode: SupportedCurrency = 'USD',
  fractionDigits: number = 0
): string {
  const config = SUPPORTED_CURRENCIES[currencyCode] || SUPPORTED_CURRENCIES.USD;
  const converted = amountInUSD * config.rateToUSD;

  // Format with standard locale formatter
  const formattedNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(converted);

  if (currencyCode === 'GHS') {
    return `GH₵${formattedNumber}`;
  }

  return `${config.symbol}${formattedNumber}`;
}

/**
 * Units of each currency per 1 USD. These reference rates (November 2026) are what a
 * price is converted with until the live rates arrive, and whenever they cannot be fetched.
 */
const UNITS_PER_USD: Record<string, number> = {
  USD: 1,
  GHS: SUPPORTED_CURRENCIES.GHS.rateToUSD,
  GBP: SUPPORTED_CURRENCIES.GBP.rateToUSD,
  EUR: SUPPORTED_CURRENCIES.EUR.rateToUSD,
  NGN: 1352,
  KES: 130,
  ZAR: 16.9,
  CAD: 1.43,
  AUD: 1.48,
  INR: 94.3,
  CNY: 6.68,
  JPY: 160,
  AED: 3.67
};

export function isKnownCurrency(code: string): boolean {
  return code.toUpperCase() in UNITS_PER_USD;
}

/** Converts an amount in any known currency to USD. Returns undefined for an unknown currency. */
export function toUSD(amount: number, currencyCode: string): number | undefined {
  const rate = UNITS_PER_USD[currencyCode.toUpperCase()];
  if (!rate || !Number.isFinite(amount)) return undefined;
  return Math.round((amount / rate) * 100) / 100;
}

// --- Live rates ---------------------------------------------------------------------------

/** Free, keyless, updated daily; answers any origin. */
const RATES_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
const RATES_KEY = 'hunu_fx_rates';
const RATES_TTL_MS = 12 * 60 * 60 * 1000;

export interface RatesStatus {
  /** True once the day's rates are in use rather than the reference rates. */
  live: boolean;
  /** When the provider last updated the rates in use (ms since epoch). */
  updatedAt?: number;
}

let status: RatesStatus = { live: false };

export function ratesStatus(): RatesStatus {
  return status;
}

/** How many units of `code` one US dollar buys at the rate in use. */
export function unitsPerUSD(code: string): number | undefined {
  return UNITS_PER_USD[code.toUpperCase()];
}

/** Puts a table of units-per-USD into use. Implausible values are ignored. */
export function applyRates(rates: Record<string, number>, updatedAt?: number): void {
  let applied = 0;
  for (const [code, rate] of Object.entries(rates)) {
    if (!/^[A-Z]{3}$/.test(code) || typeof rate !== 'number' || !(rate > 0) || !Number.isFinite(rate)) continue;
    UNITS_PER_USD[code] = code === 'USD' ? 1 : rate;
    applied++;
  }
  if (applied === 0) return;
  for (const code of Object.keys(SUPPORTED_CURRENCIES) as SupportedCurrency[]) {
    SUPPORTED_CURRENCIES[code].rateToUSD = UNITS_PER_USD[code];
  }
  status = { live: true, updatedAt };
}

interface StoredRates {
  fetchedAt: number;
  updatedAt?: number;
  rates: Record<string, number>;
}

function localStore(): chrome.storage.StorageArea | undefined {
  try {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local ? chrome.storage.local : undefined;
  } catch {
    return undefined;
  }
}

let loading: Promise<boolean> | undefined;

/**
 * Brings the day's exchange rates into use. Rates fetched in the last twelve hours are
 * reused from extension storage, so the popup, side panel and page script agree and
 * the provider is asked at most twice a day. Resolves false when neither the stored
 * nor the fetched rates could be had; the reference rates then stay in use.
 */
export function loadLiveRates(): Promise<boolean> {
  if (loading) return loading;
  loading = (async () => {
    const store = localStore();
    let stale: StoredRates | undefined;
    try {
      const saved = store ? ((await store.get(RATES_KEY))[RATES_KEY] as StoredRates | undefined) : undefined;
      if (saved?.rates) {
        if (Date.now() - saved.fetchedAt < RATES_TTL_MS) {
          applyRates(saved.rates, saved.updatedAt);
          return true;
        }
        stale = saved;
      }
    } catch {
      // Storage is an optimisation; fall through to the network.
    }

    const res = await fetchText(RATES_ENDPOINT, { timeoutMs: 4000, cacheTtlMs: 0, headers: { Accept: 'application/json' } });
    try {
      const body = JSON.parse(res.text) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number };
      if (res.status === 200 && body.result === 'success' && body.rates && body.rates.USD === 1) {
        const updatedAt = body.time_last_update_unix ? body.time_last_update_unix * 1000 : Date.now();
        applyRates(body.rates, updatedAt);
        const record: StoredRates = { fetchedAt: Date.now(), updatedAt, rates: body.rates };
        store?.set({ [RATES_KEY]: record }).catch(() => undefined);
        return true;
      }
    } catch {
      // Not JSON: treated as a failed fetch below.
    }

    // Yesterday's rates beat the reference rates.
    if (stale) {
      applyRates(stale.rates, stale.updatedAt);
      return true;
    }
    // Let a later search try again.
    loading = undefined;
    return false;
  })();
  return loading;
}
