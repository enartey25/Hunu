import React from 'react';
import { CompanyProfile } from '../engine/types';
import { SupportedCurrency } from '../engine/currency';
import { MapPin, LocateFixed, ChevronDown } from 'lucide-react';

interface HeaderProps {
  profile: CompanyProfile;
  onOpenProfile: () => void;
  onDetectLocation?: () => void;
  currency?: SupportedCurrency;
  onCurrencyChange?: (currency: SupportedCurrency) => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  onOpenProfile,
  onDetectLocation,
  currency = 'USD',
  onCurrencyChange
}) => {
  const place =
    profile.userRole === 'student'
      ? profile.studentProfile?.institution || profile.location.organization
      : profile.location.organization || profile.companyName;

  return (
    <header className="flex items-center justify-between gap-2">
      <span className="text-[26px] font-bold leading-none tracking-tight">Hunu</span>

      <div className="flex items-center gap-1.5 min-w-0">
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-2 min-w-0 text-left rounded hover:bg-sign-deep transition-colors pr-1"
          title="Change your location and profile"
        >
          <span className="pic">
            <MapPin />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[13px] font-semibold truncate max-w-[150px]">
              {profile.location.city}, {profile.location.country}
            </span>
            {place && (
              <span className="block text-xs text-on-sign truncate max-w-[150px]">{place}</span>
            )}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </button>

        {onDetectLocation && (
          <button
            onClick={onDetectLocation}
            className="btn btn-icon"
            title="Detect my location now"
            aria-label="Detect my location now"
          >
            <LocateFixed />
          </button>
        )}

        {onCurrencyChange && (
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as SupportedCurrency)}
            className="field w-auto! h-8! min-h-8! py-0.5! px-1.5! text-[13px] font-semibold"
            title="Display currency"
            aria-label="Display currency"
          >
            <option value="USD">USD</option>
            <option value="GHS">GHS</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        )}
      </div>
    </header>
  );
};
