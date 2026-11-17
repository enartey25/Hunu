import React, { useState } from 'react';
import { SearchFilterOptions, ServiceCategory } from '../engine/types';
import { ALL_SERVICE_CATEGORIES } from '../engine/vendorDatabase';
import { Search, X, SlidersHorizontal } from 'lucide-react';

interface FilterToolbarProps {
  filters: SearchFilterOptions;
  onChange: (updated: SearchFilterOptions) => void;
  resultCount: number;
}

const SORTS: { value: NonNullable<SearchFilterOptions['sortBy']>; label: string }[] = [
  { value: 'value_score', label: 'Best value' },
  { value: 'price_asc', label: 'Lowest price' },
  { value: 'distance_asc', label: 'Nearest' },
  { value: 'rating_desc', label: 'Top rated' }
];

const AUDIENCES: { value: NonNullable<SearchFilterOptions['targetAudience']>; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'student', label: 'Student deals' },
  { value: 'business', label: 'Business' },
  { value: 'supply_chain', label: 'Freight' }
];

export const FilterToolbar: React.FC<FilterToolbarProps> = ({ filters, onChange, resultCount }) => {
  const [open, setOpen] = useState(false);
  const currentAudience = filters.targetAudience || 'all';
  const currentSort = filters.sortBy || 'value_score';

  const displayedCategories = ALL_SERVICE_CATEGORIES.filter((c) => {
    if (currentAudience === 'all') return true;
    if (currentAudience === 'student') return c.audience === 'student' || c.audience === 'all';
    if (currentAudience === 'supply_chain')
      return c.audience === 'supply_chain' || c.audience === 'all';
    return c.audience === 'b2b' || c.audience === 'all';
  });

  const activeCount =
    (currentAudience !== 'all' ? 1 : 0) +
    (filters.category && filters.category !== 'All' ? 1 : 0) +
    (filters.contractPreference && filters.contractPreference !== 'any' ? 1 : 0) +
    (filters.maxDistanceKm ? 1 : 0);

  const selectCategory = (cat: ServiceCategory | 'All') => onChange({ ...filters, category: cat });

  return (
    <div className="mt-2.5">
      <div className="relative">
        <Search className="w-[18px] h-[18px] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          aria-label="Search for a product"
          placeholder="Search a product, e.g. ESP32 dev board"
          value={filters.query || ''}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          className="field pl-9! pr-9! text-[15px]"
        />
        {filters.query && (
          <button
            onClick={() => onChange({ ...filters, query: '' })}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-ground"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-2.5">
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Rank deals by">
          {SORTS.map((s) => (
            <button
              key={s.value}
              role="tab"
              aria-selected={currentSort === s.value}
              onClick={() => onChange({ ...filters, sortBy: s.value })}
              className={`btn btn-clear ${currentSort === s.value ? "is-on" : ""}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={`btn btn-clear ml-auto shrink-0 ${open ? "is-on" : ""}`}
          aria-label={`Filters${activeCount > 0 ? `, ${activeCount} active` : ''}`}
          title="Filters"
        >
          <SlidersHorizontal />
          <span className="max-[470px]:hidden">Filters</span>
          {activeCount > 0 && <span className="fig">{activeCount}</span>}
        </button>
      </div>

      {open && (
        <div className="mt-2.5 pt-2.5 border-t-2 border-ink space-y-2.5">
          <div>
            <span className="block text-xs font-semibold text-on-sign mb-1">Show</span>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  aria-pressed={currentAudience === a.value}
                  onClick={() => onChange({ ...filters, targetAudience: a.value, category: 'All' })}
                  className={`btn ${currentAudience === a.value ? 'is-on' : ''}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-on-sign mb-1">Category</span>
            <div className="flex flex-wrap gap-1.5 max-h-[104px] overflow-y-auto">
              <button
                aria-pressed={!filters.category || filters.category === 'All'}
                onClick={() => selectCategory('All')}
                className={`btn ${!filters.category || filters.category === 'All' ? 'is-on' : ''}`}
              >
                All ({resultCount})
              </button>
              {displayedCategories.map(({ category, label }) => (
                <button
                  key={category}
                  aria-pressed={filters.category === category}
                  onClick={() => selectCategory(category)}
                  className={`btn ${filters.category === category ? 'is-on' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-xs font-semibold text-on-sign mb-1">Distance</span>
              <select
                value={filters.maxDistanceKm || 0}
                onChange={(e) => onChange({ ...filters, maxDistanceKm: Number(e.target.value) })}
                className="field text-[13px]"
              >
                <option value={0}>Any distance</option>
                <option value={30}>Within 30 km</option>
                <option value={100}>Within 100 km</option>
                <option value={500}>Within 500 km</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-on-sign mb-1">Billing</span>
              <select
                value={filters.contractPreference || 'any'}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    contractPreference: e.target.value as SearchFilterOptions['contractPreference']
                  })
                }
                className="field text-[13px]"
              >
                <option value="any">Any billing</option>
                <option value="monthly">Monthly, no lock-in</option>
                <option value="annual">Annual commitment</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
