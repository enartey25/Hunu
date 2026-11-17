import React, { useState } from 'react';
import { ScoredVendorResult } from '../engine/types';
import { ValueScoreBadge } from './ValueScoreBadge';
import { TrustBadge } from './TrustBadge';
import { SupportedCurrency, formatCurrencyAmount } from '../engine/currency';
import { resolveVendorSearchUrl } from '../engine/urlResolver';
import { deliveredText, deliveryCharge, deliveryUncertain, itemCostUSD } from '../engine/deliveryText';
import { X, ArrowRight, FileSpreadsheet, Printer } from 'lucide-react';
import { Dialog } from './Dialog';

interface ComparisonMatrixProps {
  vendors: ScoredVendorResult[];
  onRemoveVendor: (id: string) => void;
  onClearAll: () => void;
  currency?: SupportedCurrency;
  searchQuery?: string;
}

export const ComparisonMatrix: React.FC<ComparisonMatrixProps> = ({
  vendors,
  onRemoveVendor,
  onClearAll,
  currency = 'USD',
  searchQuery = ''
}) => {
  const [showMemoModal, setShowMemoModal] = useState(false);

  if (vendors.length === 0) return null;

  const handleExportCSV = () => {
    const headers = [
      'Rank',
      'Seller',
      'Category',
      'Value Score',
      'Price before delivery (USD)',
      'Delivery (USD)',
      'Delivered total (USD)',
      'Against the average ($)',
      'Savings (%)',
      'Location',
      'Distance (km)',
      'Courier / Delivery',
      'Contract Term',
      'Guarantee',
      'Certifications',
      'Rating',
      'Search & Product URL'
    ];

    const rows = vendors.map((v, i) => [
      i + 1,
      `"${v.vendor.name.replace(/"/g, '""')}"`,
      `"${v.vendor.category}"`,
      v.totalValueScore,
      itemCostUSD(v),
      `"${deliveryCharge(v, 'USD')}"`,
      `"${deliveredText(v, 'USD')}"`,
      v.roiEstimate.estimatedSavingsVsAvg,
      `${v.roiEstimate.savingsPercent}%`,
      `"${v.vendor.location.city}, ${v.vendor.location.country}"`,
      v.breakdown.distanceKm ?? 'N/A',
      `"${v.shippingEstimate?.courierName ?? 'Digital'} (${v.shippingEstimate?.deliveryEstimate ?? ''})"`,
      v.vendor.pricing.contractTerm,
      `"${v.vendor.slaGuarantee.replace(/"/g, '""')}"`,
      `"${v.vendor.complianceCertifications.join('; ')}"`,
      v.vendor.rating,
      `"${resolveVendorSearchUrl(v.vendor, searchQuery)}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `hunu_deal_comparison_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const topPick = [...vendors].sort((a, b) => b.totalValueScore - a.totalValueScore)[0];

  const money = (v: ScoredVendorResult) =>
    v.vendor.pricing.baseMonthlyCost > 0
      ? deliveredText(v, currency)
      : 'Price on site';

  return (
    <div className="band border-2 border-ink overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 bg-ink text-white">
        <h2 className="font-semibold text-[15px]">
          Comparing {vendors.length} {vendors.length === 1 ? 'deal' : 'deals'}
        </h2>
        <div className="flex items-center gap-1.5 band-lead bg-transparent!">
          <button onClick={handleExportCSV} className="btn" title="Download as a CSV spreadsheet">
            <FileSpreadsheet />
            CSV
          </button>
          <button onClick={() => setShowMemoModal(true)} className="btn" title="Open a printable summary">
            <Printer />
            Memo
          </button>
          <button onClick={onClearAll} className="btn" title="Remove all deals from the comparison">
            <X />
            Clear
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left text-xs border-collapse break-words hyphens-auto">
          <thead>
            <tr className="border-b border-rule bg-ground">
              <th className="px-1.5 py-2 w-[92px] text-mute font-semibold text-xs">
                Seller
              </th>
              {vendors.map((item) => (
                <th key={item.vendor.id} className="px-1.5 py-2 border-l border-rule align-top">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <span className="font-semibold text-ink block text-[13px] leading-tight">
                        {item.vendor.name}
                      </span>
                      <span className="text-xs text-mute font-normal">
                        {item.vendor.category}
                      </span>
                    </div>
                    <button
                      onClick={() => onRemoveVendor(item.vendor.id)}
                      className="icon-btn shrink-0 -mt-0.5 -mr-1"
                      aria-label={`Remove ${item.vendor.name} from comparison`}
                      title="Remove from comparison"
                    >
                      <X />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {/* Value Score */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Value score
              </td>
              {vendors.map((item) => (
                <td key={item.vendor.id} className="px-1.5 py-2 border-l border-rule align-top">
                  <ValueScoreBadge score={item.totalValueScore} size="sm" />
                  {item.vendor.id === topPick.vendor.id && vendors.length > 1 && (
                    <span className="tag-sign block w-fit mt-1">Best value</span>
                  )}
                </td>
              ))}
            </tr>

            {/* Trust */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">Trust</td>
              {vendors.map((item) => (
                <td key={item.vendor.id} className="px-1.5 py-2 border-l border-rule align-top">
                  <TrustBadge trust={item.trust} />
                  {item.trust && <span className="block text-xs text-mute mt-1">{item.trust.advice}</span>}
                </td>
              ))}
            </tr>

            {/* Estimated Annual TCO */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Price
              </td>
              {vendors.map((item) => (
                <td
                  key={item.vendor.id}
                  className="px-1.5 py-2 border-l border-rule align-top tabular-nums font-bold text-ink"
                >
                  {item.vendor.pricing.baseMonthlyCost > 0
                    ? formatCurrencyAmount(itemCostUSD(item), currency)
                    : 'Price on site'}
                  {currency !== 'USD' && item.vendor.pricing.baseMonthlyCost > 0 && (
                    <span className="block text-xs text-mute font-normal">
                      ${itemCostUSD(item).toLocaleString()} USD
                    </span>
                  )}
                </td>
              ))}
            </tr>

            {/* Estimated Shipping */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Delivery
              </td>
              {vendors.map((item) => (
                <td
                  key={item.vendor.id}
                  className="px-1.5 py-2 border-l border-rule align-top text-xs text-ink"
                >
                  <span className="tabular-nums font-bold text-ink">{deliveryCharge(item, currency)}</span>
                  <span className="block text-xs text-mute">{item.shippingEstimate?.basis}</span>
                </td>
              ))}
            </tr>

            {/* Total landed cost */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Delivered total
              </td>
              {vendors.map((item) => {
                const landedCost = item.totalLandedCost ?? item.roiEstimate.annualCostEst;
                return (
                  <td
                    key={item.vendor.id}
                    className="px-1.5 py-2 border-l border-rule align-top tabular-nums font-bold text-base text-ink bg-sign-tint"
                  >
                    {item.vendor.pricing.baseMonthlyCost > 0
                      ? deliveredText(item, currency)
                      : 'Price on site'}
                    {currency !== 'USD' && item.vendor.pricing.baseMonthlyCost > 0 && !deliveryUncertain(item) && (
                      <span className="block text-xs text-mute font-normal">
                        ${landedCost.toLocaleString()} USD
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Against the average */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Against the average
              </td>
              {vendors.map((item) => (
                <td
                  key={item.vendor.id}
                  className="px-1.5 py-2 border-l border-rule align-top font-semibold text-good"
                >
                  {item.vendor.pricing.baseMonthlyCost <= 0
                    ? 'No price to compare'
                    : item.roiEstimate.savingsPercent > 0
                    ? `${item.roiEstimate.savingsPercent}% cheaper (${formatCurrencyAmount(item.roiEstimate.estimatedSavingsVsAvg, currency)})`
                    : 'About average'}
                </td>
              ))}
            </tr>

            {/* Location & Proximity */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Location
              </td>
              {vendors.map((item) => (
                <td key={item.vendor.id} className="px-1.5 py-2 border-l border-rule align-top text-mute">
                  <div>
                    {item.vendor.location.city}, {item.vendor.location.stateOrRegion}
                  </div>
                  <span className="text-xs text-mute font-medium">
                    {item.breakdown.distanceKm !== undefined
                      ? `${item.breakdown.distanceKm} km away`
                      : 'Online'}
                  </span>
                </td>
              ))}
            </tr>

            {/* Terms */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Billing
              </td>
              {vendors.map((item) => (
                <td
                  key={item.vendor.id}
                  className="px-1.5 py-2 border-l border-rule align-top first-letter:uppercase font-medium text-ink"
                >
                  {item.vendor.pricing.contractTerm.replace(/_/g, ' ')}
                </td>
              ))}
            </tr>

            {/* Guarantee */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Guarantee
              </td>
              {vendors.map((item) => (
                <td key={item.vendor.id} className="px-1.5 py-2 border-l border-rule align-top text-mute">
                  {item.vendor.slaGuarantee}
                </td>
              ))}
            </tr>

            {/* Compliance Certifications */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Certifications
              </td>
              {vendors.map((item) => (
                <td key={item.vendor.id} className="px-1.5 py-2 border-l border-rule align-top">
                  <div className="flex flex-wrap gap-1">
                    {item.vendor.complianceCertifications.length === 0 && (
                      <span className="text-mute">None stated</span>
                    )}
                    {item.vendor.complianceCertifications.map((c, i) => (
                      <span key={i} className="chip">
                        {c}
                      </span>
                    ))}
                  </div>
                </td>
              ))}
            </tr>

            {/* Actions */}
            <tr>
              <td className="px-1.5 py-2 font-semibold text-mute bg-ground align-top">
                Action
              </td>
              {vendors.map((item) => (
                <td key={item.vendor.id} className="px-1.5 py-2 border-l border-rule align-top">
                  <a
                    href={resolveVendorSearchUrl(item.vendor, searchQuery)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-go w-full whitespace-normal! text-left px-2!"
                    title={searchQuery ? `Search "${searchQuery}" on ${item.vendor.name}` : `Open ${item.vendor.name} portal`}
                  >
                    <span>Go to offer</span>
                    <ArrowRight />
                  </a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {showMemoModal && (
        <Dialog
          title="Comparison memo"
          subtitle={searchQuery ? `Deals for “${searchQuery}”` : undefined}
          icon={<Printer />}
          onClose={() => setShowMemoModal(false)}
          width="max-w-xl"
          footer={
            <button type="button" onClick={() => window.print()} className="btn btn-ink">
              <Printer />
              Print or save as PDF
            </button>
          }
        >
          <p className="text-sm leading-relaxed">
            Scored on price, distance, fit and quality, <strong>{topPick.vendor.name}</strong> is the best
            value of the {vendors.length === 1 ? 'deal' : `${vendors.length} deals`} compared, with a value
            score of <strong>{topPick.totalValueScore} / 100</strong>
            {topPick.vendor.pricing.baseMonthlyCost > 0 && (
              <>
                {' '}
                and a delivered total of <strong>{money(topPick)}</strong>
              </>
            )}
            .
          </p>

          <table className="table">
            <thead>
              <tr>
                <th>Seller</th>
                <th className="num">Delivered total</th>
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.vendor.id} className={v.vendor.id === topPick.vendor.id ? 'bg-sign-tint' : ''}>
                  <td>
                    <span className="font-semibold block">{v.vendor.name}</span>
                    <span className="t-mute text-xs">
                      {v.vendor.location.city}
                      {v.breakdown.distanceKm !== undefined
                        ? `, ${v.breakdown.distanceKm.toLocaleString()} km away`
                        : ''}
                      {' · '}
                      {v.vendor.slaGuarantee}
                    </span>
                  </td>
                  <td className="num fig">{money(v)}</td>
                  <td className="num fig">{v.totalValueScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Dialog>
      )}
    </div>
  );
};
