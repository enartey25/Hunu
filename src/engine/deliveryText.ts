/**
 * How delivery and the delivered total are written, the same way on every surface:
 * the card, the comparison, the verdict and the map. An exact charge is written as a
 * figure, a range as a range marked "estimate", and an unknown charge is never given a
 * number: the ranking assumption behind it stays out of sight.
 */
import { ScoredVendorResult } from './types';
import { SupportedCurrency, formatCurrencyAmount } from './currency';

const fmt = (usd: number, currency: SupportedCurrency) => formatCurrencyAmount(usd, currency);
const range = (a: number, b: number, currency: SupportedCurrency) =>
  Math.abs(a - b) < 0.01 ? fmt(a, currency) : `${fmt(a, currency)} – ${fmt(b, currency)}`;

/** The item's own price, before delivery. */
export function itemCostUSD(r: ScoredVendorResult): number {
  const landed = r.totalLandedCost ?? r.roiEstimate.annualCostEst;
  return Math.max(0, Math.round((landed - (r.shippingEstimate?.estimatedCostUSD ?? 0)) * 100) / 100);
}

/** The total the buyer pays, as text: one figure, a range, or the item price alone. */
export function deliveredText(r: ScoredVendorResult, currency: SupportedCurrency): string {
  const est = r.shippingEstimate;
  const item = itemCostUSD(r);
  if (!est) return fmt(r.totalLandedCost ?? r.roiEstimate.annualCostEst, currency);
  switch (est.kind) {
    case 'range':
      return range(item + (est.minUSD ?? 0), item + (est.maxUSD ?? 0), currency);
    case 'unknown':
      return fmt(item, currency);
    default:
      return fmt(item + (est.minUSD ?? est.estimatedCostUSD), currency);
  }
}

/** The short line under a price. */
export function deliveryNote(r: ScoredVendorResult, currency: SupportedCurrency): string {
  const est = r.shippingEstimate;
  if (!est) return '';
  switch (est.kind) {
    case 'pickup':
      return 'you collect';
    case 'free':
      return est.condition ? 'free delivery, conditions apply' : 'free delivery';
    case 'exact':
      return est.estimatedCostUSD === 0 ? 'nothing to ship' : `incl. ${fmt(est.estimatedCostUSD, currency)} delivery`;
    case 'range':
      return `incl. ${range(est.minUSD ?? 0, est.maxUSD ?? 0, currency)} delivery, estimate`;
    default:
      return '+ delivery, ask the seller';
  }
}

/** The delivery charge alone, for a table cell. */
export function deliveryCharge(r: ScoredVendorResult, currency: SupportedCurrency): string {
  const est = r.shippingEstimate;
  if (!est) return '';
  switch (est.kind) {
    case 'pickup':
      return 'You collect';
    case 'free':
      return 'Free';
    case 'exact':
      return est.estimatedCostUSD === 0 ? 'None' : fmt(est.estimatedCostUSD, currency);
    case 'range':
      return `${range(est.minUSD ?? 0, est.maxUSD ?? 0, currency)} (estimate)`;
    default:
      return 'Unknown';
  }
}

/** True when the delivered total is not a single known figure. */
export function deliveryUncertain(r: ScoredVendorResult): boolean {
  return r.shippingEstimate?.kind === 'range' || r.shippingEstimate?.kind === 'unknown';
}
