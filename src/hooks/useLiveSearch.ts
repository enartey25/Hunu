import { useCallback, useEffect, useRef, useState } from 'react';
import { CompanyProfile, ServiceCategory, VendorService } from '../engine/types';
import { runLiveSearch, LiveSearchOptions, LiveSearchResult, SourceReport } from '../engine/liveSearch';
import { getCuratedDeals, LiveWebDeal } from '../engine/liveWebDealFinder';
import { StoreReport } from '../engine/storeSources';
import { SellerRatings, fetchSellerRatings, watchCommunityPrices } from '../engine/communityPrices';
import { sellerKey } from '../engine/trust';

// Long enough that a search fires when typing pauses, not on every word: each search
// costs a request to every store that is asked.
const DEBOUNCE_MS = 650;

/** Runs one search. The extension asks the stores itself; the website asks Hunu's API. */
export type SearchRunner = (query: string, profile: CompanyProfile, options: LiveSearchOptions) => Promise<LiveSearchResult>;

export interface LiveSearchState {
  liveWebVendors: VendorService[];
  liveStores: VendorService[];
  /** Prices other Hunu users shared for this search. */
  communityPrices: VendorService[];
  /** Shops other Hunu users pinned that match this search. */
  communityShops: VendorService[];
  liveDeals: LiveWebDeal[];
  isSearchingWeb: boolean;
  sources: SourceReport[];
  /** The online stores asked for this search, each with a link to its own results. */
  stores: StoreReport[];
  /** The shorter search that supplied similar items, when exact matches were too few. */
  broadenedTo?: string;
  /** The trip, when the search was read as one; its fares are in liveWebVendors. */
  trip?: LiveSearchResult['trip'];
  fareCalendar: NonNullable<LiveSearchResult['fareCalendar']>;
  /** What Hunu users said about the sellers in these results, keyed by `sellerKey`. */
  sellerRatings: SellerRatings;
  /** Records a rating this device just gave, so the result reflects it without a refetch. */
  noteOwnRating: (key: string, stars: number) => void;
  /** Adds deals found outside the search, such as for the seller of the page being viewed. */
  addDeals: (deals: LiveWebDeal[]) => void;
}

function mergeDeals(...groups: LiveWebDeal[][]): LiveWebDeal[] {
  const seen = new Set<string>();
  const out: LiveWebDeal[] = [];
  for (const group of groups) {
    for (const deal of group) {
      if (seen.has(deal.id)) continue;
      seen.add(deal.id);
      out.push(deal);
    }
  }
  return out;
}

/**
 * The live half of a search, shared by the popup, the side panel and the website.
 *
 * Debounces typing, cancels the search a newer keystroke supersedes, and never lets a
 * slow response for an old query overwrite the results of the current one.
 */
export function useLiveSearch(
  query: string | undefined,
  profile: CompanyProfile | null,
  category?: ServiceCategory,
  runner: SearchRunner = runLiveSearch
): LiveSearchState {
  const [liveWebVendors, setLiveWebVendors] = useState<VendorService[]>([]);
  const [liveStores, setLiveStores] = useState<VendorService[]>([]);
  const [communityPrices, setCommunityPrices] = useState<VendorService[]>([]);
  const [communityShops, setCommunityShops] = useState<VendorService[]>([]);
  const [searchDeals, setSearchDeals] = useState<LiveWebDeal[]>([]);
  const [extraDeals, setExtraDeals] = useState<LiveWebDeal[]>([]);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [sources, setSources] = useState<SourceReport[]>([]);
  const [stores, setStores] = useState<StoreReport[]>([]);
  const [broadenedTo, setBroadenedTo] = useState<string | undefined>();
  const [trip, setTrip] = useState<LiveSearchResult['trip']>();
  const [fareCalendar, setFareCalendar] = useState<NonNullable<LiveSearchResult['fareCalendar']>>([]);
  const [sellerRatings, setSellerRatings] = useState<SellerRatings>(new Map());
  const requestId = useRef(0);

  const trimmed = (query || '').trim();
  // Only the parts of the profile a search depends on, so editing weights does not refetch.
  const lat = profile?.location.latitude;
  const lon = profile?.location.longitude;
  const country = profile?.location.country;

  useEffect(() => {
    const id = ++requestId.current;

    if (!profile || trimmed.length < 2) {
      setIsSearchingWeb(false);
      setLiveWebVendors([]);
      setLiveStores([]);
      setCommunityPrices([]);
      setCommunityShops([]);
      setSearchDeals([]);
      setSources([]);
      setStores([]);
      setBroadenedTo(undefined);
      setTrip(undefined);
      setFareCalendar([]);
      return;
    }

    const controller = new AbortController();
    let stopWatching: (() => void) | undefined;
    setIsSearchingWeb(true);

    const timer = setTimeout(async () => {
      try {
        const result = await runner(trimmed, profile, { signal: controller.signal, category });
        if (id !== requestId.current) return;
        setLiveWebVendors(result.webVendors);
        setLiveStores(result.localStores);
        setCommunityPrices(result.communityPrices || []);
        setCommunityShops(result.communityShops || []);
        setSearchDeals(result.deals);
        setSources(result.sources);
        setStores(result.stores || []);
        setBroadenedTo(result.broadenedTo);
        setTrip(result.trip);
        setFareCalendar(result.fareCalendar || []);

        // What Hunu buyers said about these sellers, in one request.
        const keys = [...result.webVendors, ...result.localStores, ...(result.communityPrices || []), ...(result.communityShops || [])]
          .map(sellerKey)
          .filter((k): k is string => !!k);
        void fetchSellerRatings(keys, controller.signal).then((ratings) => {
          if (id === requestId.current) setSellerRatings(ratings);
        });

        // From here, prices other buyers share, confirm or flag arrive while the results are open.
        if (!controller.signal.aborted) {
          stopWatching = watchCommunityPrices(
            trimmed,
            profile.location,
            (rows) => {
              if (id === requestId.current) setCommunityPrices(rows);
            },
            category
          );
        }
      } catch {
        // A failed search leaves the previous results; the status line says why.
      } finally {
        if (id === requestId.current) setIsSearchingWeb(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
      stopWatching?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, lat, lon, country, category, runner]);

  const addDeals = useCallback((deals: LiveWebDeal[]) => {
    if (deals.length > 0) setExtraDeals((prev) => mergeDeals(deals, prev));
  }, []);

  const noteOwnRating = useCallback((key: string, stars: number) => {
    setSellerRatings((prev) => {
      const next = new Map(prev);
      const had = next.get(key);
      // Shown straight away as one more rating; the next search brings the stored figures.
      next.set(key, had ? { ...had, average: (had.average * had.count + stars) / (had.count + 1), count: had.count + 1 } : { average: stars, count: 1 });
      return next;
    });
  }, []);

  return {
    liveWebVendors,
    liveStores,
    communityPrices,
    communityShops,
    liveDeals: mergeDeals(searchDeals, extraDeals, getCuratedDeals()),
    isSearchingWeb,
    sources,
    stores,
    broadenedTo,
    trip,
    fareCalendar,
    sellerRatings,
    noteOwnRating,
    addDeals
  };
}
