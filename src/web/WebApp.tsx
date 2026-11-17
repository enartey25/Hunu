import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { CompanyProfile, ScoredVendorResult, SearchFilterOptions, ServiceCategory, VendorService } from '../engine/types';
import { getCompanyProfile, saveCompanyProfile, getCustomQuotes, saveCustomQuote, deleteCustomQuote } from '../storage/companyStore';
import { searchAndRankVendors } from '../engine/searchEngine';
import { SEED_VENDORS } from '../engine/vendorDatabase';
import { useLiveSearch } from '../hooks/useLiveSearch';
import { remoteSearch } from '../engine/remoteSearch';
import { detectUserLocation } from '../engine/geolocation';
import { SupportedCurrency, loadLiveRates } from '../engine/currency';
import { PAGE_DEAL_ID, judgePageDeal, VerdictSubject } from '../engine/pageDeal';
import { getSimilarProductRecommendations } from '../engine/similarRecommendations';
import { communityEnabled } from '../engine/communityPrices';
import { affiliateDisclosure } from '../engine/affiliate';
import { Header } from '../components/Header';
import { FilterToolbar } from '../components/FilterToolbar';
import { VendorCard } from '../components/VendorCard';
import { CompanyProfileModal } from '../components/CompanyProfileModal';
import { ROICalculatorModal } from '../components/ROICalculatorModal';
import { ComparisonMatrix } from '../components/ComparisonMatrix';
import { AddCustomQuoteModal, QuotePrefill } from '../components/AddCustomQuoteModal';
import { LabBOMCalculatorModal } from '../components/LabBOMCalculatorModal';
import { PinShopModal } from '../components/PinShopModal';
import { RateSellerModal } from '../components/RateSellerModal';
import { DealMap } from '../components/map/DealMap';
import { TripPanel, WatchedTrips } from '../components/TripPanel';
import { PageVerdictBand, SearchStatus, NoResults, ViewSwitch, ResultsView } from '../components/Shell';
import { FileText, MapPinPlus, ListChecks, Scale } from 'lucide-react';

/** True on screens wide enough to show the list and the map side by side. */
function useWide(): boolean {
  const query = '(min-width: 1024px)';
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/**
 * Hunu on the web: the same search, ranking, map, quote check, pins and Trust score as
 * the extension, laid out for a phone first. The stores are asked through Hunu's API.
 */
export const WebApp: React.FC = () => {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [customQuotes, setCustomQuotes] = useState<VendorService[]>([]);
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
  const [filters, setFilters] = useState<SearchFilterOptions>({ category: 'All', targetAudience: 'all', sortBy: 'value_score' });
  const [comparedIds, setComparedIds] = useState<string[]>([]);
  const [, setRatesVersion] = useState(0);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAddQuoteOpen, setIsAddQuoteOpen] = useState(false);
  const [quotePrefill, setQuotePrefill] = useState<QuotePrefill | undefined>(undefined);
  const [judged, setJudged] = useState<{ id: string; subject: VerdictSubject }>({ id: PAGE_DEAL_ID, subject: 'page' });
  const [isBOMModalOpen, setIsBOMModalOpen] = useState(false);
  const [isPinShopOpen, setIsPinShopOpen] = useState(false);
  const [rateTarget, setRateTarget] = useState<VendorService | null>(null);
  const [activeRoiTarget, setActiveRoiTarget] = useState<ScoredVendorResult | null>(null);
  const [view, setView] = useState<ResultsView>('list');
  const [focusId, setFocusId] = useState<string | null>(null);
  // Accessories are shown only for the search the buyer asked to see them in.
  const [accessoriesFor, setAccessoriesFor] = useState<string | null>(null);
  const wide = useWide();

  const category = filters.category && filters.category !== 'All' ? (filters.category as ServiceCategory) : undefined;
  const { liveWebVendors, liveStores, communityPrices, communityShops, liveDeals, isSearchingWeb, sources, stores, broadenedTo, trip, fareCalendar, sellerRatings, noteOwnRating } =
    useLiveSearch(filters.query, profile, category, remoteSearch);

  useEffect(() => {
    getCompanyProfile().then((p) => {
      setProfile(p);
      if (p.location.country.toLowerCase().includes('ghana')) setCurrency('GHS');
    });
    getCustomQuotes().then(setCustomQuotes);
    loadLiveRates().then((live) => live && setRatesVersion((v) => v + 1));
  }, []);

  if (!profile) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-ground text-mute text-sm" role="status">
        Loading Hunu
      </div>
    );
  }

  const pool = filters.query?.trim()
    ? [...liveWebVendors, ...liveStores, ...communityPrices, ...communityShops, ...customQuotes, ...SEED_VENDORS]
    : [...customQuotes, ...SEED_VENDORS];
  const showAccessories = !!filters.query && accessoriesFor === filters.query;
  const results = searchAndRankVendors(profile, { ...filters, includeAccessories: showAccessories }, pool, liveDeals, sellerRatings);
  const comparedVendors = results.filter((r) => comparedIds.includes(r.vendor.id));
  const verdict = judgePageDeal(results, filters.sortBy || 'value_score', judged.id, judged.subject);
  const suggestions = getSimilarProductRecommendations(filters.query, filters.category !== 'All' ? filters.category : undefined);
  const disclosure = affiliateDisclosure();

  const saveProfile = async (updated: CompanyProfile) => {
    setProfile(updated);
    if (updated.location.country.toLowerCase().includes('ghana')) setCurrency('GHS');
    await saveCompanyProfile(updated);
  };

  const detectLocation = async () => {
    const loc = await detectUserLocation();
    await saveProfile({
      ...profile,
      location: { ...profile.location, city: loc.city, stateOrRegion: loc.stateOrRegion, country: loc.country, latitude: loc.latitude, longitude: loc.longitude, organization: loc.organization }
    });
  };

  const saveQuote = async (quote: VendorService) => {
    await saveCustomQuote(quote);
    setCustomQuotes((prev) => [quote, ...prev]);
    if (quote.quotedProduct) {
      setJudged({ id: quote.id, subject: 'quote' });
      setFilters((prev) => ({ ...prev, query: quote.quotedProduct }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const removeQuote = async (id: string) => {
    await deleteCustomQuote(id);
    setCustomQuotes((prev) => prev.filter((q) => q.id !== id));
    setComparedIds((prev) => prev.filter((x) => x !== id));
    if (judged.id === id) setJudged({ id: PAGE_DEAL_ID, subject: 'page' });
  };

  const savePin = async (shop: VendorService) => {
    await saveCustomQuote(shop);
    setCustomQuotes((prev) => [shop, ...prev]);
  };

  const openQuoteCheck = (prefill?: QuotePrefill) => {
    setQuotePrefill(prefill);
    setIsAddQuoteOpen(true);
  };

  const toggleCompare = (id: string) => {
    if (comparedIds.includes(id)) setComparedIds(comparedIds.filter((x) => x !== id));
    else if (comparedIds.length < 3) setComparedIds([...comparedIds, id]);
  };

  const showInList = (id: string) => {
    setView('list');
    setFocusId(id);
  };

  const map = results.length > 0 && (
    <DealMap
      results={results}
      home={profile.location}
      currency={currency}
      onShowInList={showInList}
      onPinShop={() => setIsPinShopOpen(true)}
      tall={wide}
    />
  );

  const list = (
    <div className="space-y-1.5" hidden={!wide && view === 'map' && results.length > 0}>
      {results.length === 0 ? (
        <NoResults query={filters.query} suggestions={suggestions} onPick={(q) => setFilters((prev) => ({ ...prev, query: q }))} />
      ) : (
        results.map((result, idx) => (
          <VendorCard
            key={result.vendor.id}
            rank={idx + 1}
            result={result}
            onOpenRoi={setActiveRoiTarget}
            onToggleCompare={toggleCompare}
            isCompared={comparedIds.includes(result.vendor.id)}
            compareFull={comparedIds.length >= 3}
            currency={currency}
            searchQuery={filters.query || ''}
            onSelectRecommendation={(q) => setFilters((prev) => ({ ...prev, query: q }))}
            onRecordQuote={(shop) => openQuoteCheck({ sellerName: shop.name, phone: shop.phone, location: shop.location })}
            onRemoveQuote={removeQuote}
            focused={focusId === result.vendor.id}
            onRateSeller={setRateTarget}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="min-h-dvh flex flex-col bg-ground text-ink">
      <div className="bg-sign sticky top-0 z-[500] shadow-sm">
        <div className="max-w-6xl mx-auto px-4 pt-3 pb-3">
          <Header profile={profile} onOpenProfile={() => setIsProfileModalOpen(true)} onDetectLocation={detectLocation} currency={currency} onCurrencyChange={setCurrency} />
          <FilterToolbar filters={filters} onChange={setFilters} resultCount={results.length} />
        </div>
      </div>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-3 pb-24 lg:pb-6 space-y-2.5">
        {!filters.query?.trim() && (
          <section className="band p-4">
            <h1 className="font-bold text-[22px] leading-tight">What did they quote you?</h1>
            <p className="t-mute text-[14px] mt-1">
              Search a product to see the best deals near you, or check a price a seller gave you against everything Hunu can find.
            </p>
            <button type="button" onClick={() => openQuoteCheck()} className="btn btn-ink mt-3">
              <FileText />
              Check a quote
            </button>
          </section>
        )}

        {verdict && filters.query?.trim() && <PageVerdictBand verdict={verdict} searching={isSearchingWeb} currency={currency} />}

        {trip && filters.query?.trim() && (
          <TripPanel
            trip={trip}
            calendar={fareCalendar}
            fares={liveWebVendors}
            currency={currency}
            issue={sources.find((s) => s.source === 'travel')?.error?.replace(/^flights: /, '')}
            onSearch={(q) => setFilters((prev) => ({ ...prev, query: q }))}
          />
        )}
        {(!filters.query?.trim() || trip) && (
          <WatchedTrips currency={currency} refreshKey={filters.query} onSearch={(q) => setFilters((prev) => ({ ...prev, query: q }))} />
        )}

        <SearchStatus
          searching={isSearchingWeb}
          dealCount={liveWebVendors.length + liveStores.length}
          sharedCount={communityPrices.length}
          liveIssue={!communityEnabled() ? 'this build has no Hunu API address' : sources.find((s) => s.source === 'web' && !s.ok)?.error}
          stores={stores}
          broadenedTo={broadenedTo}
          accessories={{
            count: results.accessoryCount,
            shown: showAccessories,
            onToggle: () => setAccessoriesFor(showAccessories ? null : filters.query || null)
          }}
          query={filters.query}
          city={profile.location.city}
          hasCatalogueRows={results.some((r) => SEED_VENDORS.some((v) => v.id === r.vendor.id))}
        />

        {comparedVendors.length > 0 && (
          <ComparisonMatrix
            vendors={comparedVendors}
            onRemoveVendor={toggleCompare}
            onClearAll={() => setComparedIds([])}
            currency={currency}
            searchQuery={filters.query || ''}
          />
        )}

        {wide ? (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-start">
            {list}
            <div className="sticky top-[150px]">{map}</div>
          </div>
        ) : (
          <>
            {results.length > 0 && (
              <ViewSwitch
                view={view}
                onChange={(v) => {
                  setView(v);
                  setFocusId(null);
                }}
              />
            )}
            {view === 'map' && map}
            {list}
          </>
        )}

        {disclosure && <p className="t-mute text-xs px-1 pt-2">{disclosure}</p>}
      </main>

      {/* Phones: the main actions within thumb reach. */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-[500] bg-sign border-t border-ink/10" aria-label="Actions">
        <div className="grid grid-cols-4 max-w-xl mx-auto">
          <button type="button" onClick={() => openQuoteCheck()} className="web-tab">
            <FileText />
            Check a quote
          </button>
          <button type="button" onClick={() => setIsPinShopOpen(true)} className="web-tab">
            <MapPinPlus />
            Pin a shop
          </button>
          <button type="button" onClick={() => setIsBOMModalOpen(true)} className="web-tab">
            <ListChecks />
            Parts list
          </button>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="web-tab"
            disabled={comparedIds.length === 0}
            title={comparedIds.length === 0 ? 'Add a deal to the comparison first' : undefined}
          >
            <Scale />
            Compare {comparedIds.length > 0 ? `(${comparedIds.length})` : ''}
          </button>
        </div>
      </nav>

      <CompanyProfileModal profile={profile} isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} onSave={saveProfile} />

      {isAddQuoteOpen && (
        <AddCustomQuoteModal
          isOpen
          onClose={() => setIsAddQuoteOpen(false)}
          onSaveQuote={saveQuote}
          home={profile.location}
          defaultProduct={filters.query?.trim() || ''}
          defaultCurrency={currency}
          category={category}
          prefill={quotePrefill}
        />
      )}

      {rateTarget && <RateSellerModal vendor={rateTarget} onClose={() => setRateTarget(null)} onRated={noteOwnRating} />}

      {isPinShopOpen && (
        <PinShopModal onClose={() => setIsPinShopOpen(false)} onSave={savePin} home={profile.location} defaultSells={filters.query?.trim() || ''} category={category} />
      )}

      <LabBOMCalculatorModal isOpen={isBOMModalOpen} onClose={() => setIsBOMModalOpen(false)} currency={currency} destinationCity={profile.location.city} />

      {activeRoiTarget && (
        <ROICalculatorModal isOpen result={activeRoiTarget} profile={profile} onClose={() => setActiveRoiTarget(null)} currency={currency} />
      )}
    </div>
  );
};
