import React, { useState } from 'react';
import { ScoredVendorResult, CompanyProfile } from '../engine/types';
import { SupportedCurrency, formatCurrencyAmount } from '../engine/currency';
import { Calculator } from 'lucide-react';
import { Dialog } from './Dialog';

interface ROICalculatorModalProps {
  result: ScoredVendorResult;
  profile: CompanyProfile;
  currency?: SupportedCurrency;
  isOpen: boolean;
  onClose: () => void;
}

export const ROICalculatorModal: React.FC<ROICalculatorModalProps> = ({
  result,
  profile,
  currency = 'USD',
  isOpen,
  onClose
}) => {
  const { vendor, roiEstimate } = result;

  const [activeHeadcount, setActiveHeadcount] = useState<number>(() => {
    switch (profile.headcount) {
      case '1-10':
        return 7;
      case '11-50':
        return 28;
      case '51-200':
        return 95;
      case '201-1000':
        return 420;
      case '1000+':
        return 1200;
      default:
        return 25;
    }
  });

  const [baselineCustomCost, setBaselineCustomCost] = useState<number>(
    roiEstimate.industryAvgAnnualCost
  );

  if (!isOpen) return null;

  // Calculate annual cost based on dynamic headcount
  let calculatedAnnualCost = 0;
  if (vendor.pricing.pricingModel === 'per_user') {
    calculatedAnnualCost = vendor.pricing.baseMonthlyCost * activeHeadcount * 12;
  } else if (vendor.pricing.pricingModel === 'flat_monthly') {
    calculatedAnnualCost = vendor.pricing.baseMonthlyCost * 12;
  } else {
    const scale = activeHeadcount > 100 ? 2.5 : activeHeadcount > 30 ? 1.5 : 1.0;
    calculatedAnnualCost = vendor.pricing.baseMonthlyCost * scale * 12;
  }

  const annualSavings = Math.max(0, baselineCustomCost - calculatedAnnualCost);
  const savingsPct = Math.round((annualSavings / Math.max(1, baselineCustomCost)) * 100);
  const perPersonAnnual = Math.round(calculatedAnnualCost / Math.max(1, activeHeadcount));

  const formatCurrency = (amt: number) => formatCurrencyAmount(amt, currency);

  return (
    <Dialog
      title="Savings estimate"
      subtitle={vendor.name}
      icon={<Calculator />}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className="btn btn-ink">
          Done
        </button>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="flex items-baseline justify-between">
            <span className="label mb-0!">People or seats</span>
            <span className="fig">{activeHeadcount.toLocaleString()}</span>
          </span>
          <input
            type="range"
            min="3"
            max={Math.max(300, activeHeadcount)}
            value={activeHeadcount}
            onChange={(e) => setActiveHeadcount(parseInt(e.target.value))}
            className="range"
          />
        </label>

        <label className="block">
          <span className="label">What you pay now, per year (USD)</span>
          <input
            type="number"
            min="0"
            value={baselineCustomCost}
            onChange={(e) => setBaselineCustomCost(Number(e.target.value))}
            className="field"
          />
          <span className="t-mute text-xs block mt-1">
            Starts at the average for {vendor.category}. Change it to your own figure.
          </span>
        </label>
      </div>

      <dl className="answer grid-cols-2" aria-live="polite">
        <div>
          <dt>Yearly cost with this seller</dt>
          <dd className="fig">{formatCurrency(calculatedAnnualCost)}</dd>
          <dd>{formatCurrency(perPersonAnnual)} per person a year</dd>
        </div>
        <div className="is-key">
          <dt>You save each year</dt>
          <dd className="fig">{formatCurrency(annualSavings)}</dd>
          <dd>{savingsPct > 0 ? `${savingsPct}% less than you pay now` : 'No saving at this figure'}</dd>
        </div>
      </dl>

      <dl className="rows">
        <div>
          <dt>Billing</dt>
          <dd className="first-letter:uppercase">{vendor.pricing.contractTerm.replace(/_/g, ' ')}</dd>
        </div>
        <div>
          <dt>Guarantee</dt>
          <dd>{vendor.slaGuarantee}</dd>
        </div>
        {vendor.complianceCertifications.length > 0 && (
          <div>
            <dt>Certifications</dt>
            <dd>{vendor.complianceCertifications.join(', ')}</dd>
          </div>
        )}
      </dl>
    </Dialog>
  );
};
