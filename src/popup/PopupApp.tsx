import React, { useState, useEffect, useRef } from 'react';
import { CompanyProfile, ScoredVendorResult, SearchFilterOptions, VendorService, ServiceCategory } from '../engine/types';
import { getCompanyProfile, saveCompanyProfile, getCustomQuotes, saveCustomQuote, deleteCustomQuote } from '../storage/companyStore';
import { searchAndRankVendors } from '../engine/searchEngine';
import { SEED_VENDORS } from '../engine/vendorDatabase';
import { searchLiveWebDeals } from '../engine/liveWebDealFinder';
import { useLiveSearch } from '../hooks/useLiveSearch';
import { detectUserLocation } from '../engine/geolocation';
import { SupportedCurrency, loadLiveRates } from '../engine/currency';
import { PAGE_DEAL_ID, pageDealToVendor, queryFromTitle, judgePageDeal, VerdictSubject } from '../engine/pageDeal';
import { ExtractedPageDeal } from '../content/pageDealExtractor';
import { readPageDeal } from '../content/readPageDeal';
import { getSimilarProductRecommendations } from '../engine/similarRecommendations';
import { Header } from '../components/Header';
import { FilterToolbar } from '../components/FilterToolbar';
import { VendorCard } from '../components/VendorCard';
import { CompanyProfileModal } from '../components/CompanyProfileModal';
import { ROICalculatorModal } from '../components/ROICalculatorModal';
import { ComparisonMatrix } from '../components/ComparisonMatrix';
import { AddCustomQuoteModal, QuotePrefill } from '../components/AddCustomQuoteModal';
import { LabBOMCalculatorModal } from '../components/LabBOMCalculatorModal';
import { PageDealBand, PageVerdictBand, SearchStatus, FootBand, NoResults, ViewSwitch, ResultsView } from '../components/Shell';
import { DealMap } from '../components/map/DealMap';
import { TripPanel, WatchedTrips } from '../components/TripPanel';
import { PinShopModal } from '../components/PinShopModal';
import { RateSellerModal } from '../components/RateSellerModal';

export const PopupApp: React.FC = () => {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [customQuotes, setCustomQuotes] = useState<VendorService[]>([]);
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
  const [activePageDeal, setActivePageDeal] = useState<ExtractedPageDeal | null>(null);
  const [detectedPageVendor, setDetectedPageVendor] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilterOptions>({
    category: 'All',
    targetAudience: 'all',
    sortBy: 'value_score'
  });
  const [comparedIds, setComparedIds] = useState<string[]>([]);
  // Accessories are shown only for the search the buyer asked to see them in.
  const [accessoriesFor, setAccessoriesFor] = useState<string | null>(null);
  // Bumped when the day's exchange rates arrive, so every amount on screen is redrawn with them.
  const [, setRatesVersion] = useState(0);

  // Live web listings, local stores and deals for the current search.
  const { liveWebVendors, liveStores, communityPrices, communityShops, liveDeals, isSearchingWeb, sources, stores, broadenedTo, trip, fareCalendar, sellerRatings, noteOwnRating, addDeals } = useLiveSearch(
    filters.query,
    profile,
    filters.category && filters.category !== 'All' ? (filters.category as ServiceCategory) : undefined
  );
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAddQuoteOpen, setIsAddQuoteOpen] = useState(false);
  // The seller a quote is being recorded for, when it was opened from a shop's card.
  const [quotePrefill, setQuotePrefill] = useState<QuotePrefill | undefined>(undefined);
  // The offer the verdict is about: the page being viewed, or the quote last checked.
  const [judged, setJudged] = useState<{ id: string; subject: VerdictSubject }>({ id: PAGE_DEAL_ID, subject: 'page' });
  const [isBOMModalOpen, setIsBOMModalOpen] = useState(false);
  // The results as a ranked list or on a map, and the row the map asked to show in the list.
  const [view, setView] = useState<ResultsView>('list');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [isPinShopOpen, setIsPinShopOpen] = useState(false);
  // The seller being rated after a purchase.
  const [rateTarget, setRateTarget] = useState<VendorService | null>(null);
  const [activeRoiTarget, setActiveRoiTarget] = useState<ScoredVendorResult | null>(null);
  const [showCompareSection, setShowCompareSection] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    getCompanyProfile().then((p) => {
      setProfile(p);
      // Auto-set local currency if in Ghana
      if (p.location.country.toLowerCase().includes('ghana')) {
        setCurrency('GHS');
      }
    });
    getCustomQuotes().then(setCustomQuotes);
    loadLiveRates().then((live) => live && setRatesVersion((v) => v + 1));

    // Query deal on active tab
    queryActiveTabDeal();

    // Listen to tab updates to re-extract deals from current webpage
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const tabListener = (_tabId: number, changeInfo: { status?: string; url?: string }) => {
        if (changeInfo.status === 'complete' || changeInfo.url) {
          queryActiveTabDeal();
        }
      };

      chrome.tabs.onUpdated.addListener(tabListener);
      return () => {
        chrome.tabs.onUpdated.removeListener(tabListener);
      };
    }
  }, []);

  const queryActiveTabDeal = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab?.id) return;

        const url = activeTab.url || '';
        checkActiveUrlForVendor(url);

        // Read the offer on the page: from the page itself, or by fetching it.
        readPageDeal(activeTab).then((deal) => {
          if (deal) setActivePageDeal(deal);
        });
      });
    }
  };

  const checkActiveUrlForVendor = (url: string) => {
    const allVendors = [...customQuotes, ...SEED_VENDORS];
    const matched = allVendors.find((v) => {
      try {
        const vendorDomain = new URL(v.websiteUrl).hostname.replace('www.', '');
        return url.includes(vendorDomain);
      } catch {
        return false;
      }
    });
    if (matched) {
      setDetectedPageVendor(matched.name);
      searchLiveWebDeals(matched.name).then(addDeals);
    } else {
      setDetectedPageVendor(null);
    }
  };

  // Convert active webpage offer into a comparable vendor item and search for alternatives
  const handleCompareCurrentPageDeal = () => {
    if (!activePageDeal) return;

    const pageVendorId = PAGE_DEAL_ID;
    const pageVendor = pageDealToVendor(
      activePageDeal,
      (filters.category && filters.category !== 'All' ? filters.category : 'General Products & Retail') as ServiceCategory,
      profile!
    );

    setCustomQuotes((prev) => [pageVendor, ...prev.filter((q) => q.id !== pageVendorId)]);
    setJudged({ id: PAGE_DEAL_ID, subject: 'page' });

    // Trigger live web search for market alternatives for this deal
    // Search on the product, not the whole page title. The buyer's ranking criterion is kept.
    setFilters((prev) => ({ ...prev, query: queryFromTitle(activePageDeal.title) }));

    const otherTopIds = results
      .filter((r) => r.vendor.id !== pageVendorId)
      .slice(0, 2)
      .map((r) => r.vendor.id);

    setComparedIds([pageVendorId, ...otherTopIds]);
    setShowCompareSection(true);
  };

  if (!profile) {
    return (
      <div className="w-[440px] h-[600px] flex items-center justify-center bg-ground text-mute text-sm" role="status">
        Loading Hunu
      </div>
    );
  }

  // Combine live-scraped web results + live city stores + user custom quotes + verified catalog
  const combinedVendorPool = filters.query?.trim()
    ? [...liveWebVendors, ...liveStores, ...communityPrices, ...communityShops, ...customQuotes, ...SEED_VENDORS]
    : [...customQuotes, ...SEED_VENDORS];
  const showAccessories = !!filters.query && accessoriesFor === filters.query;
  const results = searchAndRankVendors(profile, { ...filters, includeAccessories: showAccessories }, combinedVendorPool, liveDeals, sellerRatings);
  const comparedVendors = results.filter((r) => comparedIds.includes(r.vendor.id));
  // Once the page's offer has been ranked: how it stands, and what beats it.
  const pageVerdict = judgePageDeal(results, filters.sortBy || 'value_score', judged.id, judged.subject);
  const queryRecommendations = getSimilarProductRecommendations(
    filters.query,
    filters.category !== 'All' ? filters.category : undefined
  );

  const handleSaveProfile = async (updated: CompanyProfile) => {
    setProfile(updated);
    if (updated.location.country.toLowerCase().includes('ghana')) {
      setCurrency('GHS');
    }
    await saveCompanyProfile(updated);
  };

  const handleDetectLocation = async () => {
    const loc = await detectUserLocation();
    const updated: CompanyProfile = {
      ...profile,
      location: {
        ...profile.location,
        city: loc.city,
        stateOrRegion: loc.stateOrRegion,
        country: loc.country,
        latitude: loc.latitude,
        longitude: loc.longitude,
        organization: loc.organization
      }
    };
    if (loc.country.toLowerCase().includes('ghana')) {
      setCurrency('GHS');
    }
    setProfile(updated);
    await saveCompanyProfile(updated);
  };

  const handleSaveCustomQuote = async (quote: VendorService) => {
    await saveCustomQuote(quote);
    setCustomQuotes((prev) => [quote, ...prev]);
    // A product quote is checked straight away: search the product and judge the quote.
    if (quote.quotedProduct) {
      setJudged({ id: quote.id, subject: 'quote' });
      setFilters((prev) => ({ ...prev, query: quote.quotedProduct }));
      mainRef.current?.scrollTo({ top: 0 });
    }
  };

  const handleRemoveQuote = async (quoteId: string) => {
    await deleteCustomQuote(quoteId);
    setCustomQuotes((prev) => prev.filter((q) => q.id !== quoteId));
    setComparedIds((prev) => prev.filter((id) => id !== quoteId));
    if (judged.id === quoteId) setJudged({ id: PAGE_DEAL_ID, subject: 'page' });
  };

  const handleSavePin = async (shop: VendorService) => {
    await saveCustomQuote(shop);
    setCustomQuotes((prev) => [shop, ...prev]);
  };

  const showInList = (vendorId: string) => {
    setView('list');
    setFocusId(vendorId);
  };

  const openQuoteCheck = (prefill?: QuotePrefill) => {
    setQuotePrefill(prefill);
    setIsAddQuoteOpen(true);
  };

  const handleToggleCompare = (id: string) => {
    if (comparedIds.includes(id)) {
      setComparedIds(comparedIds.filter((item) => item !== id));
    } else {
      if (comparedIds.length >= 3) return;
      setComparedIds([...comparedIds, id]);
      setShowCompareSection(true);
    }
  };

  const openSidepanel = () => {
    if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id });
        }
      });
    }
  };

  return (
    <div className="w-[440px] h-[600px] flex flex-col bg-ground text-ink">
      <div className="bg-sign px-3.5 pt-3 pb-3 shrink-0">
        <Header
          profile={profile}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onDetectLocation={handleDetectLocation}
          currency={currency}
          onCurrencyChange={setCurrency}
        />
        <FilterToolbar filters={filters} onChange={setFilters} resultCount={results.length} />
      </div>

      <main ref={mainRef} className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {activePageDeal && (
          <PageDealBand deal={activePageDeal} onRank={handleCompareCurrentPageDeal} />
        )}

        {pageVerdict && filters.query?.trim() && (
          <PageVerdictBand verdict={pageVerdict} searching={isSearchingWeb} currency={currency} />
        )}
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
          liveIssue={sources.find((s) => s.source === 'web' && !s.ok)?.error}
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

        {showCompareSection && comparedVendors.length > 0 && (
          <ComparisonMatrix
            vendors={comparedVendors}
            onRemoveVendor={handleToggleCompare}
            onClearAll={() => {
              setComparedIds([]);
              setShowCompareSection(false);
            }}
            currency={currency}
            searchQuery={filters.query || ''}
          />
        )}

        {results.length > 0 && (
          <ViewSwitch
            view={view}
            onChange={(v) => {
              setView(v);
              setFocusId(null);
            }}
          />
        )}

        {view === 'map' && results.length > 0 && (
          <DealMap
            results={results}
            home={profile.location}
            currency={currency}
            onShowInList={showInList}
            onPinShop={() => setIsPinShopOpen(true)}
          />
        )}

        <div className="space-y-1.5" hidden={view === 'map' && results.length > 0}>
          {results.length === 0 ? (
            <NoResults
              query={filters.query}
              suggestions={queryRecommendations}
              onPick={(q) => setFilters((prev) => ({ ...prev, query: q }))}
            />
          ) : (
            results.map((result, idx) => (
              <VendorCard
                key={result.vendor.id}
                rank={idx + 1}
                result={result}
                onOpenRoi={(target) => setActiveRoiTarget(target)}
                onToggleCompare={handleToggleCompare}
                isCompared={comparedIds.includes(result.vendor.id)}
                compareFull={comparedIds.length >= 3}
                currency={currency}
                searchQuery={filters.query || ''}
                onSelectRecommendation={(suggestedQuery) =>
                  setFilters((prev) => ({ ...prev, query: suggestedQuery }))
                }
                onRecordQuote={(shop) =>
                  openQuoteCheck({ sellerName: shop.name, phone: shop.phone, location: shop.location })
                }
                onRemoveQuote={handleRemoveQuote}
                focused={focusId === result.vendor.id}
                onRateSeller={setRateTarget}
              />
            ))
          )}
        </div>

      </main>

      <FootBand
        className="shrink-0"
        count={comparedIds.length}
        comparisonOpen={showCompareSection && comparedIds.length > 0}
        onComparison={() => {
          setShowCompareSection(!showCompareSection);
          mainRef.current?.scrollTo({ top: 0 });
        }}
        onOpenBom={() => setIsBOMModalOpen(true)}
        onAddQuote={() => openQuoteCheck()}
        onOpenSidepanel={openSidepanel}
      />

      <CompanyProfileModal
        profile={profile}
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onSave={handleSaveProfile}
      />

      {/* Mounted per opening, so each quote starts from the current search and seller. */}
      {isAddQuoteOpen && (
        <AddCustomQuoteModal
          isOpen
          onClose={() => setIsAddQuoteOpen(false)}
          onSaveQuote={handleSaveCustomQuote}
          home={profile.location}
          defaultProduct={filters.query?.trim() || ''}
          defaultCurrency={currency}
          category={filters.category && filters.category !== 'All' ? (filters.category as ServiceCategory) : undefined}
          prefill={quotePrefill}
        />
      )}

      {rateTarget && <RateSellerModal vendor={rateTarget} onClose={() => setRateTarget(null)} onRated={noteOwnRating} />}

      {isPinShopOpen && (
        <PinShopModal
          onClose={() => setIsPinShopOpen(false)}
          onSave={handleSavePin}
          home={profile.location}
          defaultSells={filters.query?.trim() || ''}
          category={filters.category && filters.category !== 'All' ? (filters.category as ServiceCategory) : undefined}
        />
      )}

      <LabBOMCalculatorModal
        isOpen={isBOMModalOpen}
        onClose={() => setIsBOMModalOpen(false)}
        currency={currency}
        destinationCity={profile.location.city}
      />

      {activeRoiTarget && (
        <ROICalculatorModal
          result={activeRoiTarget}
          profile={profile}
          currency={currency}
          isOpen={true}
          onClose={() => setActiveRoiTarget(null)}
        />
      )}
    </div>
  );
};
