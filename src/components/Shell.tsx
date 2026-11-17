import React from 'react';
import { ExtractedPageDeal } from '../content/pageDealExtractor';
import { StoreReport } from '../engine/storeSources';
import { PageVerdict, CRITERION_LABEL } from '../engine/pageDeal';
import { SupportedCurrency } from '../engine/currency';
import { deliveredText } from '../engine/deliveryText';
import { TrustBadge } from './TrustBadge';
import { affiliateDisclosure, withAffiliate } from '../engine/affiliate';
import { ArrowRight, Loader2, Globe, Tag, PanelRightOpen, SearchX, BookOpen, TriangleAlert, Users, List, Map as MapIcon, EyeOff } from 'lucide-react';

/** The offer Hunu detected on the page the user is looking at. */
export const PageDealBand: React.FC<{ deal: ExtractedPageDeal; onRank: () => void }> = ({
  deal,
  onRank
}) => (
  <section className="band border-2 border-ink p-3 flex items-center gap-3">
    <span className="pic self-start">
      <Tag />
    </span>
    <div className="min-w-0 flex-1">
      <h2 className="font-semibold text-[15px] leading-tight line-clamp-2">{deal.title}</h2>
      <p className="t-mute text-[13px] mt-0.5">
        On this page ({deal.domain}) · <span className="fig text-ink">{deal.priceText}</span>
        {deal.discountPercent && deal.listPriceText ? (
          <>
            {' '}
            <s>{deal.listPriceText}</s> <span className="tag-sign">{deal.discountPercent}% off</span>
          </>
        ) : null}{' '}
        ·{' '}
        <a href={deal.url} target="_blank" rel="noopener noreferrer" className="lnk">
          View page
        </a>
      </p>
    </div>
    <button onClick={onRank} className="btn btn-go shrink-0">
      Rank this deal
      <ArrowRight />
    </button>
  </section>
);

/**
 * The verdict on the page's offer once it has been ranked against the market: its
 * score as a percentage, where it placed, and the offers that beat it.
 */
export const PageVerdictBand: React.FC<{
  verdict: PageVerdict;
  searching: boolean;
  currency: SupportedCurrency;
}> = ({ verdict, searching, currency }) => {
  if (searching) {
    return (
      <section className="band border-2 border-ink p-3 flex items-center gap-2 text-[13px]" role="status">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span>Sizing this {verdict.subject} up against the market</span>
      </section>
    );
  }
  return (
    <section className="band border-2 border-ink p-3" role="status" aria-label={`Verdict on this ${verdict.subject}`}>
      <div className="flex items-center gap-3">
        <div className="text-center shrink-0">
          <span className="fig block text-[34px] leading-none">{verdict.score}%</span>
          <span className="t-mute block text-xs mt-1">
            #{verdict.rank} of {verdict.total}
          </span>
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-[16px] leading-tight">{verdict.headline}</h2>
          <p className="t-mute text-[13px] mt-0.5">
            Ranked by {CRITERION_LABEL[verdict.criterion]}. This {verdict.subject} scores {verdict.score}% for value. {verdict.detail}
          </p>
        </div>
      </div>

      {verdict.better.some((r) => r.trust?.level === 'risky' || r.trust?.level === 'caution') && (
        <p className="flex items-start gap-2 text-[13px] mt-2" role="note">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5 text-warn" />
          <span>Cheaper is not always safer: one of these has a weak trust record. Open it before you switch.</span>
        </p>
      )}

      {verdict.better.length > 0 && (
        <ol className="mt-2.5 border-t b-rule">
          {verdict.better.map((r) => {
            const url = r.vendor.exactOrderUrl || r.vendor.websiteUrl;
            return (
              <li key={r.vendor.id} className="grid grid-cols-[1fr_auto_auto] gap-x-2.5 items-center py-1.5 border-b b-rule text-[13px]">
                <span className="min-w-0 line-clamp-2 leading-tight" title={r.vendor.name}>
                  {r.vendor.name}
                  {(r.trust?.level === 'risky' || r.trust?.level === 'caution') && <TrustBadge trust={r.trust} className="ml-1.5" />}
                  {r.vendor.discountPercent ? <span className="tag-sign ml-1.5">{r.vendor.discountPercent}% off</span> : null}
                </span>
                <span className="text-right whitespace-nowrap">
                  <span className="fig block leading-tight">
                    {deliveredText(r, currency)}
                  </span>
                  <span className="t-mute block text-xs">
                    {verdict.criterion === 'distance_asc' && r.breakdown.distanceKm !== undefined
                      ? `${r.breakdown.distanceKm.toLocaleString()} km`
                      : verdict.criterion === 'rating_desc' && r.vendor.ratingKnown !== false
                      ? `${r.vendor.rating.toFixed(1)} / 5`
                      : `${r.totalValueScore}%`}
                  </span>
                </span>
                <a
                  href={withAffiliate(url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-go btn-icon"
                  aria-label={`Go to offer: ${r.vendor.name}`}
                  title={url}
                >
                  <ArrowRight />
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

export const SearchStatus: React.FC<{
  searching: boolean;
  dealCount: number;
  query?: string;
  city: string;
  /** True when the ranked list includes sellers from the built-in catalogue. */
  hasCatalogueRows?: boolean;
  /** Set when the live web search could not run, so thin results are explained. */
  liveIssue?: string;
  /** The online stores that were asked, each linking to its own results for the query. */
  stores?: StoreReport[];
  /** The shorter search that supplied similar items, when exact matches were too few. */
  broadenedTo?: string;
  /** How many prices other Hunu users shared for this search. */
  sharedCount?: number;
  /** Cases, chargers and other add-ons the search turned up, and whether they are shown. */
  accessories?: { count: number; shown: boolean; onToggle: () => void };
}> = ({ searching, dealCount, query, city, hasCatalogueRows = false, liveIssue, stores = [], broadenedTo, sharedCount = 0, accessories }) => {
  const accessoryNote = accessories && accessories.count > 0 && query?.trim() && (
    <p className="flex items-start gap-2 text-[13px] px-1" role="status">
      <EyeOff className="w-4 h-4 shrink-0 mt-0.5" />
      <span>
        {accessories.shown
          ? `${accessories.count === 1 ? 'One accessory is' : `${accessories.count} accessories are`} in the list, marked “accessory”. `
          : `Hid ${accessories.count === 1 ? 'one accessory' : `${accessories.count} accessories`} (cases, chargers and the like). `}
        <button type="button" onClick={accessories.onToggle} className="underline font-semibold">
          {accessories.shown ? 'Hide them' : 'Show them'}
        </button>
      </span>
    </p>
  );
  const sharedNote = sharedCount > 0 && query?.trim() && (
    <p className="flex items-start gap-2 text-[13px] px-1" role="status">
      <Users className="w-4 h-4 shrink-0 mt-0.5" />
      <span>
        {sharedCount === 1 ? 'One price' : `${sharedCount} prices`} shared by Hunu users near {city}. Quoted in person, so
        ask before you go.
      </span>
    </p>
  );
  const broadenedNote = broadenedTo && query?.trim() && (
    <p className="flex items-start gap-2 text-[13px] px-1" role="status">
      <SearchX className="w-4 h-4 shrink-0 mt-0.5" />
      <span>Few exact matches, so similar items for “{broadenedTo}” are included.</span>
    </p>
  );
  const answered = stores.filter((s) => s.ok && s.count > 0);
  const storesNote = answered.length > 0 && query?.trim() && (
    <p className="text-[13px] px-1 leading-relaxed">
      <span>Checked: </span>
      {answered.map((s, i) => (
        <React.Fragment key={s.id}>
          {i > 0 && ' · '}
          <a href={s.searchUrl} target="_blank" rel="noreferrer" className="underline">
            {s.name}
          </a>
        </React.Fragment>
      ))}
    </p>
  );
  const issueNote = liveIssue && query?.trim() && (
    <p className="flex items-start gap-2 text-[13px] px-1" role="status">
      <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
      <span>The live search did not answer ({liveIssue}). Try again in a few minutes.</span>
    </p>
  );

  const catalogueNote = hasCatalogueRows && (
    <p className="flex items-center gap-2 text-[13px] px-1">
      <BookOpen className="w-4 h-4 shrink-0" />
      <span>Rows with this mark are catalogue prices, not live checks.</span>
    </p>
  );

  if (searching) {
    return (
      <p className="flex items-center gap-2 text-[13px] px-1" role="status">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span>
          Searching the web and stores near {city} for “{query}”
        </span>
      </p>
    );
  }
  if (dealCount > 0 && query) {
    return (
      <>
        <p className="flex items-center gap-2 text-[13px] px-1" role="status">
          <Globe className="w-4 h-4 shrink-0 text-good" />
          <span>
            Found {dealCount} live {dealCount === 1 ? 'listing or store' : 'listings and stores'}
          </span>
        </p>
        {storesNote}
        {accessoryNote}
        {affiliateDisclosure() && <p className="t-mute text-xs px-1">{affiliateDisclosure()}</p>}
        {sharedNote}
        {broadenedNote}
        {issueNote}
        {catalogueNote}
      </>
    );
  }
  if (!query?.trim()) {
    return (
      <p className="flex items-center gap-2 text-[13px] px-1" role="status">
        <BookOpen className="w-4 h-4 shrink-0" />
        <span>Built-in catalogue. Search a product for live deals.</span>
      </p>
    );
  }
  return issueNote || catalogueNote || sharedNote ? (
    <>
      {sharedNote}
      {issueNote}
      {catalogueNote}
    </>
  ) : null;
};

export type ResultsView = 'list' | 'map';

/** Switches the results between the ranked list and the map. */
export const ViewSwitch: React.FC<{ view: ResultsView; onChange: (view: ResultsView) => void }> = ({ view, onChange }) => (
  <div className="flex items-center gap-1.5 px-1" role="group" aria-label="Show results as">
    <button type="button" onClick={() => onChange('list')} aria-pressed={view === 'list'} className={`btn ${view === 'list' ? 'is-on' : ''}`}>
      <List />
      List
    </button>
    <button type="button" onClick={() => onChange('map')} aria-pressed={view === 'map'} className={`btn ${view === 'map' ? 'is-on' : ''}`}>
      <MapIcon />
      Map
    </button>
  </div>
);

/** The yellow foot band: tools on the left, the way to the comparison on the right. */
export const FootBand: React.FC<{
  count: number;
  comparisonOpen?: boolean;
  /** Overrides the comparison button label, for surfaces where the comparison is always shown. */
  comparisonLabel?: string;
  onComparison: () => void;
  onOpenBom: () => void;
  onAddQuote: () => void;
  onOpenSidepanel?: () => void;
  className?: string;
}> = ({ count, comparisonOpen = false, comparisonLabel, onComparison, onOpenBom, onAddQuote, onOpenSidepanel, className = '' }) => (
  <footer className={`bg-sign px-3.5 py-2 flex items-center gap-1.5 ${className}`}>
    <button onClick={onOpenBom} className="btn btn-clear" title="Price a list of parts with shipping">
      Parts list
    </button>
    <button onClick={onAddQuote} className="btn btn-clear" title="Check a price a seller quoted you against the online offers">
      Check a quote
    </button>
    {onOpenSidepanel && (
      <button
        onClick={onOpenSidepanel}
        className="btn btn-clear btn-icon"
        title="Open Hunu beside the page"
        aria-label="Open Hunu in the side panel"
      >
        <PanelRightOpen />
      </button>
    )}
    <span className="ml-auto text-[13px] font-semibold whitespace-nowrap" role="status">
      <span className="fig">{count}</span> of 3
    </span>
    <button
      onClick={onComparison}
      disabled={count === 0}
      className="btn btn-ink"
      title={count === 0 ? 'Add a deal to the comparison first' : undefined}
    >
      {comparisonLabel ?? (comparisonOpen ? 'Hide comparison' : 'Open comparison')}
      <ArrowRight />
    </button>
  </footer>
);

export const NoResults: React.FC<{
  query?: string;
  suggestions: { name: string; suggestedQuery: string; note: string }[];
  onPick: (query: string) => void;
}> = ({ query, suggestions, onPick }) => (
  <section className="band p-4">
    <div className="flex items-start gap-3">
      <span className="pic">
        <SearchX />
      </span>
      <div>
        <h2 className="font-semibold text-base leading-tight">
          {query ? `No deals found for “${query}”` : 'No deals match these filters'}
        </h2>
        <p className="t-mute text-[13px] mt-1">
          {suggestions.length > 0
            ? 'It may be unlisted or out of stock. These compatible products are worth a search:'
            : 'Try a wider distance, or clear the category filter.'}
        </p>
      </div>
    </div>
    {suggestions.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-3">
        {suggestions.map((rec, i) => (
          <button key={i} type="button" onClick={() => onPick(rec.suggestedQuery)} className="btn" title={rec.note}>
            {rec.name}
            <ArrowRight />
          </button>
        ))}
      </div>
    )}
  </section>
);
