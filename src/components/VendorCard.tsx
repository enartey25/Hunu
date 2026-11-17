import React, { useEffect, useRef, useState } from 'react';
import { ScoredVendorResult, VendorService } from '../engine/types';
import { askPriceLinks, communityNote } from '../engine/quote';
import { voteOnReport, voteOnShop, VoteResult } from '../engine/communityPrices';
import { pinNote } from '../engine/shopPins';
import { deliveredText, deliveryCharge, deliveryNote, itemCostUSD } from '../engine/deliveryText';
import { sellerKey } from '../engine/trust';
import { withAffiliate } from '../engine/affiliate';
import { TrustBadge, TrustDetails } from './TrustBadge';
import { SupportedCurrency, formatCurrencyAmount } from '../engine/currency';
import { resolveOrderDestination, resolveDealSearchUrl } from '../engine/urlResolver';
import { getSimilarProductRecommendations } from '../engine/similarRecommendations';
import { SEED_VENDORS } from '../engine/vendorDatabase';
import {
  MapPin,
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  Store,
  Tag,
  Copy,
  BookOpen,
  MessageCircle,
  Phone,
  FileText,
  Trash2,
  Users,
  ThumbsUp,
  Flag
} from 'lucide-react';

interface VendorCardProps {
  rank: number;
  result: ScoredVendorResult;
  onOpenRoi: (result: ScoredVendorResult) => void;
  onToggleCompare?: (vendorId: string) => void;
  isCompared?: boolean;
  /** True when the comparison already holds its maximum of three deals. */
  compareFull?: boolean;
  currency?: SupportedCurrency;
  searchQuery?: string;
  onSelectRecommendation?: (suggestedQuery: string) => void;
  /** Record the price a shop with no published price quoted the buyer. */
  onRecordQuote?: (vendor: VendorService) => void;
  /** Remove a quote or a shop pin the buyer added. */
  onRemoveQuote?: (vendorId: string) => void;
  /** True when the map's "Show in list" picked this row: it opens and scrolls into view. */
  focused?: boolean;
  /** Rate the seller after buying. */
  onRateSeller?: (vendor: VendorService) => void;
}

const SUB_SCORES: { key: 'priceScore' | 'locationScore' | 'fitScore' | 'qualityScore'; label: string }[] = [
  { key: 'priceScore', label: 'Price' },
  { key: 'locationScore', label: 'Distance' },
  { key: 'fitScore', label: 'Fit' },
  { key: 'qualityScore', label: 'Quality' }
];

/** Sellers that ship with Hunu. Their prices are catalogue figures, not live checks. */
const CATALOGUE_IDS = new Set(SEED_VENDORS.map((v) => v.id));

export const VendorCard: React.FC<VendorCardProps> = ({
  rank,
  result,
  onOpenRoi,
  onToggleCompare,
  isCompared = false,
  compareFull = false,
  currency = 'USD',
  searchQuery = '',
  onSelectRecommendation,
  onRecordQuote,
  onRemoveQuote,
  focused = false,
  onRateSeller
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  // What this device said about a shared price, and the count once the API has answered.
  const [vote, setVote] = useState<{ kind: 'confirm' | 'flag'; result: VoteResult } | undefined>();
  const [confirmations, setConfirmations] = useState<number | undefined>();
  const { vendor, totalValueScore, breakdown, badges, roiEstimate, shippingEstimate, totalLandedCost } = result;
  const lead = rank === 1;
  const fromCatalogue = CATALOGUE_IDS.has(vendor.id);
  // Something another Hunu user shared: a price they were quoted, or a shop they pinned.
  const sharedPrice = vendor.dataSource === 'community' ? vendor.communityReport : undefined;
  const sharedShop = vendor.dataSource === 'pinned' ? vendor.communityShop : undefined;
  const shared = sharedPrice || sharedShop;
  const ownPin = vendor.dataSource === 'pinned' && !sharedShop;
  const sharedNote = sharedPrice && vendor.quotedAt
    ? communityNote(vendor.quotedAt, confirmations ?? sharedPrice.confirmations)
    : sharedShop
    ? pinNote({ ...vendor, communityShop: { ...sharedShop, confirmations: confirmations ?? sharedShop.confirmations } })
    : undefined;

  const castVote = async (kind: 'confirm' | 'flag') => {
    if (!shared || vote) return;
    const result = sharedPrice ? await voteOnReport(sharedPrice.id, kind) : await voteOnShop(shared.id, kind);
    setVote({ kind, result });
    if (result === 'counted' && kind === 'confirm') setConfirmations((confirmations ?? shared.confirmations) + 1);
  };

  // The map asked to show this row: open it and bring it into view.
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focused) return;
    setExpanded(true);
    articleRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    articleRef.current?.focus({ preventScroll: true });
  }, [focused]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // The four weighted scores, plus how well the offer matches the search when there is one.
  const subScores = [
    ...(breakdown.relevanceScore !== undefined
      ? [{ key: 'relevanceScore', label: 'Match', value: breakdown.relevanceScore }]
      : []),
    ...SUB_SCORES.map(({ key, label }) => ({ key: key as string, label, value: breakdown[key] }))
  ];

  const hasDirectWebsite = vendor.hasOfficialWebsite !== false && !vendor.id.startsWith('osm-local-');
  const isPriceStated = vendor.priceKnown !== false && vendor.pricing.baseMonthlyCost > 0;
  const landedCost = totalLandedCost ?? roiEstimate.annualCostEst;

  // The delivered total is one figure only when delivery is known exactly.
  const trip = vendor.trip;
  const priceText = trip && !isPriceStated
    ? 'Fare not published'
    : trip?.priceKind === 'from'
    ? `from ${deliveredText(result, currency)}`
    : isPriceStated
    ? deliveredText(result, currency)
    : hasDirectWebsite
    ? 'Price on site'
    : 'Ask in store';

  // A fare says how its price is known, not how it is delivered.
  const priceNote = trip
    ? { seen: `seen ${trip.checkedOn || 'recently'}`, published: 'published fare', from: 'lowest advertised', unknown: 'check with them' }[trip.priceKind] +
      (trip.passengers > 1 && isPriceStated ? `, ${trip.passengers} people` : '')
    : isPriceStated
    ? deliveryNote(result, currency)
    : hasDirectWebsite
    ? 'check at checkout'
    : 'no online price';

  // The store's own markdown: its previous price, struck through, and the percentage off.
  const markdown =
    isPriceStated && vendor.discountPercent && vendor.listPriceUSD ? (
      <>
        <s>{formatCurrencyAmount(vendor.listPriceUSD, currency)}</s>{' '}
        <span className="tag-sign">{vendor.discountPercent}% off</span>
      </>
    ) : null;

  const tripText = trip
    ? [
        trip.departAt ? new Date(trip.departAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : trip.service,
        trip.stops === undefined ? undefined : trip.stops === 0 ? 'non-stop' : `${trip.stops} stop${trip.stops > 1 ? 's' : ''}`,
        trip.durationMin ? `${Math.floor(trip.durationMin / 60)}h ${trip.durationMin % 60}m` : undefined
      ].filter(Boolean).join(' · ') || (trip.mode === 'bus' ? 'Bus' : 'Flight')
    : undefined;
  const distanceText =
    tripText ?? (breakdown.distanceKm !== undefined ? `${breakdown.distanceKm.toLocaleString()} km` : 'Online');

  const orderDest = resolveOrderDestination(vendor, searchQuery);
  const goLabel = orderDest.hasWebsite ? 'Go to offer' : 'Find the store';
  const goTitle = orderDest.hasWebsite
    ? `${orderDest.actionLabel}: ${orderDest.exactOrderUrl}`
    : 'Look up store hours and directions';
  const compareBlocked = compareFull && !isCompared;
  const compareTitle = compareBlocked
    ? 'You are comparing 3 deals. Remove one to add this.'
    : isCompared
    ? 'Remove from comparison'
    : 'Add to comparison';
  const recommendations = getSimilarProductRecommendations(searchQuery, vendor.category);
  // A pinned shop is usually on no map by name, so its pin is the only way to find it.
  const mapsUrl = vendor.dataSource === 'pinned' || vendor.dataSource === 'community'
    ? `https://www.google.com/maps/search/?api=1&query=${vendor.location.latitude},${vendor.location.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${vendor.name} ${vendor.location.city} ${vendor.location.country}`
      )}`;
  const deal = result.activeDeal;
  // A shop that publishes no price can still be asked for one.
  const canAskPrice = (vendor.dataSource === 'local' || vendor.dataSource === 'pinned') && !isPriceStated;
  const ask = canAskPrice ? askPriceLinks(vendor.phone, vendor.location.country, searchQuery) : {};

  const place = (
    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" title="See the seller on Google Maps">
      <MapPin className="inline w-3.5 h-3.5 -mt-0.5 mr-0.5" />
      {vendor.location.city}
    </a>
  );

  return (
    <article ref={articleRef} id={`deal-${vendor.id}`} tabIndex={-1} className={`band ${lead ? 'band-lead' : ''}`}>
      {lead ? (
        <>
          <div className="grid gap-x-3 items-center grid-cols-[64px_1fr] px-3.5 pt-3 pb-2.5">
            <span key={`${vendor.id}-${rank}`} className="rank text-center text-[76px]" aria-label="Rank 1">
              1
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold leading-tight text-[18px]">{vendor.name}</h3>
              <p className="t-mute text-[13px] mt-1">
                {place}
                {shippingEstimate?.deliveryEstimate ? ` · ${shippingEstimate.deliveryEstimate}` : ''}
                {fromCatalogue ? ' · catalogue listing' : ''}
                {result.accessory ? ' · accessory' : ''}
                {sharedPrice ? ' · price shared by a Hunu user' : ''}
                {vendor.dataSource === 'pinned' ? (sharedShop ? ' · shop pinned by a Hunu user' : ' · shop you pinned') : ''}
              </p>
              <TrustBadge trust={result.trust} className="mt-1.5" />
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 px-3.5 pb-3">
            <div className="border-t b-rule pt-1.5">
              <dd className="fig text-lg leading-tight">{priceText}</dd>
              <dt className="t-mute text-xs">{priceNote}</dt>
              {markdown && <dd className="t-mute text-xs mt-0.5">{markdown}</dd>}
            </div>
            <div className="border-t b-rule pt-1.5">
              <dd className="fig text-lg leading-tight">{distanceText}</dd>
              <dt className="t-mute text-xs truncate">from {vendor.location.city}</dt>
            </div>
            <div className="border-t b-rule pt-1.5">
              <dd className="fig text-lg leading-tight">{totalValueScore} / 100</dd>
              <dt className="t-mute text-xs">value score</dt>
            </div>
          </dl>
        </>
      ) : (
        <div className="grid grid-cols-[40px_1fr_auto_auto] gap-x-2.5 items-center pl-2.5 pr-2 py-1.5">
          <span key={`${vendor.id}-${rank}`} className="rank text-center text-[40px]" aria-label={`Rank ${rank}`}>
            {rank}
          </span>

          <div className="min-w-0">
            <h3 className="font-semibold leading-tight text-[14px] line-clamp-2" title={vendor.name}>
              {vendor.name}
            </h3>
            <p className="t-mute text-xs mt-0.5 truncate">
              {place}
              {' · '}
              {distanceText}
              {result.accessory ? ' · accessory' : ''}
              {sharedPrice ? ' · shared price' : ''}
              {vendor.dataSource === 'pinned' ? ' · pinned shop' : ''}
            </p>
            <TrustBadge trust={result.trust} className="mt-1" />
          </div>

          <div className="text-right">
            <span className="fig block text-[15px] leading-tight whitespace-nowrap">{priceText}</span>
            {markdown && <span className="t-mute block text-xs whitespace-nowrap">{markdown}</span>}
            <span className="t-mute block text-xs whitespace-nowrap">
              {fromCatalogue && (
                <span title="Catalogue listing: this price is from the catalogue built into Hunu, not a live check">
                  <BookOpen className="inline w-3.5 h-3.5 -mt-0.5 mr-1" aria-label="Catalogue listing" />
                </span>
              )}
              score {totalValueScore}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {onToggleCompare && (
              <button
                onClick={() => onToggleCompare(vendor.id)}
                aria-pressed={isCompared}
                aria-label={`${isCompared ? 'Remove' : 'Add'} ${vendor.name} ${isCompared ? 'from' : 'to'} comparison`}
                disabled={compareBlocked}
                title={compareTitle}
                className={`btn btn-icon ${isCompared ? 'is-on' : ''}`}
              >
                {isCompared ? <Check /> : <Plus />}
              </button>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Hide' : 'Show'} details for ${vendor.name}`}
              title={expanded ? 'Hide details' : 'Show details'}
              className="btn btn-icon"
            >
              {expanded ? <ChevronUp /> : <ChevronDown />}
            </button>
            <a
              href={withAffiliate(orderDest.exactOrderUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-go btn-icon"
              aria-label={`${goLabel}: ${vendor.name}`}
              title={goTitle}
            >
              <ArrowRight />
            </a>
          </div>
        </div>
      )}

      {deal && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t b-rule text-[13px]">
          <span className="flex items-start gap-1.5 min-w-0">
            <Tag className="w-4 h-4 shrink-0 mt-0.5" />
            <a
              href={resolveDealSearchUrl(deal, searchQuery)}
              target="_blank"
              rel="noopener noreferrer"
              className="lnk line-clamp-2"
              title={deal.description}
            >
              {deal.title}
            </a>
          </span>
          {deal.promoCode && (
            <button
              onClick={() => handleCopyCode(deal.promoCode!)}
              className="btn shrink-0"
              title="Copy promo code"
            >
              {copiedCode ? <Check /> : <Copy />}
              <span className="fig">{copiedCode ? 'Copied' : deal.promoCode}</span>
            </button>
          )}
        </div>
      )}

      {lead && (
        <div className={`flex items-center gap-1.5 px-3.5 pb-3 ${deal ? 'pt-3' : ''}`}>
          <a
            href={withAffiliate(orderDest.exactOrderUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-go"
            title={goTitle}
          >
            {goLabel}
            <ArrowRight />
          </a>

          {onToggleCompare && (
            <button
              onClick={() => onToggleCompare(vendor.id)}
              aria-pressed={isCompared}
              disabled={compareBlocked}
              title={compareBlocked ? compareTitle : undefined}
              className={`btn shrink-0 ${isCompared ? 'is-on' : ''}`}
            >
              {isCompared ? <Check /> : <Plus />}
              {isCompared ? 'Comparing' : 'Compare'}
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="btn ml-auto shrink-0"
          >
            {expanded ? 'Less' : 'Details'}
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </button>
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 pt-3 border-t b-rule text-[13px] space-y-3">
          <div className={`grid gap-2 ${subScores.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
            {subScores.map(({ key, label, value }) => (
              <div key={key}>
                <div className="flex items-baseline justify-between">
                  <span className="t-mute text-xs">{label}</span>
                  <span className="fig">{value}</span>
                </div>
                <div className="h-1.5 mt-1 rounded-sm bg-[var(--b-rule)]">
                  <div
                    className={`h-full rounded-sm ${lead ? 'bg-sign' : 'bg-ink'}`}
                    style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {result.reasons && result.reasons.length > 0 && (
            <ul className="space-y-0.5">
              {result.reasons.slice(0, 4).map((reason, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="leading-relaxed">{vendor.summary}</p>

          {fromCatalogue && (
            <p className="flex items-start gap-2">
              <BookOpen className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold">Catalogue listing.</strong> This price comes from the
                catalogue built into Hunu, not a live check. Confirm it on the seller's site.
              </span>
            </p>
          )}

          <TrustDetails trust={result.trust} onRateSeller={onRateSeller && sellerKey(vendor) ? () => onRateSeller(vendor) : undefined} />

          {sharedNote && (
            <div className="flex items-start gap-2">
              <Users className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p>
                  <strong className="font-semibold">{sharedNote}.</strong>{' '}
                  {sharedPrice
                    ? "A price another buyer was quoted, not the seller's own listing. Ask before you go."
                    : 'A shop another buyer put on the map. What it sells is in their words.'}
                </p>
                {vote ? (
                  <p className="t-mute text-xs mt-1" role="status">
                    {vote.result === 'counted'
                      ? vote.kind === 'confirm'
                        ? 'Thanks. Your confirmation is counted.'
                        : sharedPrice
                        ? 'Thanks. Prices reported wrong by two buyers are hidden.'
                        : 'Thanks. Pins reported wrong by two buyers are hidden.'
                      : vote.result === 'already'
                      ? `You already gave your view on this ${sharedPrice ? 'price' : 'pin'}.`
                      : vote.result === 'refused'
                      ? `Not counted. You cannot confirm your own ${sharedPrice ? 'report' : 'pin'}, and votes are limited each day.`
                      : 'Could not reach Hunu. Try again later.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => castVote('confirm')}
                      className="btn"
                      title={sharedPrice ? 'You were quoted the same or close to it' : 'You have seen this shop there'}
                    >
                      <ThumbsUp />
                      {sharedPrice ? 'I was quoted this too' : 'The shop is there'}
                    </button>
                    <button
                      type="button"
                      onClick={() => castVote('flag')}
                      className="btn"
                      title={sharedPrice ? 'The price or the seller is wrong' : 'There is no such shop here'}
                    >
                      <Flag />
                      {sharedPrice ? 'Report wrong price' : 'Report wrong pin'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {!orderDest.hasWebsite && (
            <p className="flex items-start gap-2">
              <Store className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold">In-store only.</strong>{' '}
                {orderDest.notes ||
                  'This seller has no online shop. Search for its opening hours, phone number and exact location.'}
              </span>
            </p>
          )}

          {canAskPrice && (ask.whatsapp || ask.tel || onRecordQuote) && (
            <div>
              <span className="block font-semibold mb-1.5">No price online. Ask them, then check it here.</span>
              <div className="flex flex-wrap gap-1.5">
                {ask.whatsapp && (
                  <a
                    href={ask.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                    title="Opens WhatsApp with the question typed. Works only if this number is on WhatsApp."
                  >
                    <MessageCircle />
                    Ask on WhatsApp
                  </a>
                )}
                {ask.tel && (
                  <a href={ask.tel} className="btn" title={`Call ${vendor.phone}`}>
                    <Phone />
                    Call
                  </a>
                )}
                {onRecordQuote && (
                  <button type="button" onClick={() => onRecordQuote(vendor)} className="btn">
                    <FileText />
                    Record their price
                  </button>
                )}
              </div>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t b-rule pt-3">
            <div>
              <dt className="t-mute text-xs">Price before delivery</dt>
              <dd className="fig">
                {isPriceStated
                  ? formatCurrencyAmount(itemCostUSD(result), currency)
                  : hasDirectWebsite
                  ? 'Price on site'
                  : 'Ask in store'}
              </dd>
              {isPriceStated && <dd className="t-mute text-xs">{vendor.pricing.startingTierLabel}</dd>}
            </div>
            <div>
              <dt className="t-mute text-xs">Delivery</dt>
              <dd className="fig">{deliveryCharge(result, currency)}</dd>
              {shippingEstimate && (
                <dd className="t-mute text-xs">
                  {shippingEstimate.basis}.
                  {shippingEstimate.condition ? ` ${shippingEstimate.condition}.` : ''}
                  {shippingEstimate.deliveryEstimate && shippingEstimate.kind !== 'pickup' ? ` ${shippingEstimate.deliveryEstimate}.` : ''}
                  {shippingEstimate.importChargesMayApply ? ' Import duty and VAT may be added.' : ''}
                  {shippingEstimate.sourceUrl && (
                    <>
                      {' '}
                      <a href={shippingEstimate.sourceUrl} target="_blank" rel="noopener noreferrer" className="lnk">
                        Source
                      </a>
                      {shippingEstimate.checkedOn ? `, checked ${shippingEstimate.checkedOn}` : ''}
                    </>
                  )}
                </dd>
              )}
            </div>
            <div>
              <dt className="t-mute text-xs">Delivered total</dt>
              <dd className="fig">{priceText}</dd>
              {shippingEstimate?.kind === 'unknown' && isPriceStated && <dd className="t-mute text-xs">plus delivery, not known</dd>}
              {currency !== 'USD' && isPriceStated && shippingEstimate?.kind !== 'range' && shippingEstimate?.kind !== 'unknown' && (
                <dd className="t-mute text-xs">${landedCost.toLocaleString()} USD</dd>
              )}
            </div>
            <div>
              <dt className="t-mute text-xs">
                {result.priceBasis === 'peers'
                  ? `Against ${result.peerCount ?? ''} other offers`
                  : 'Against the average'}
              </dt>
              <dd className="fig t-good">
                {!isPriceStated || result.priceBasis === 'none'
                  ? 'No price to compare'
                  : roiEstimate.savingsPercent > 0
                  ? `${roiEstimate.savingsPercent}% cheaper`
                  : result.priceBasis === 'peers'
                  ? 'Not below the typical price'
                  : 'About average'}
              </dd>
              {isPriceStated && roiEstimate.estimatedSavingsVsAvg > 0 && (
                <dd className="t-mute text-xs">
                  saves {formatCurrencyAmount(roiEstimate.estimatedSavingsVsAvg, currency)}
                </dd>
              )}
            </div>
            <div>
              <dt className="t-mute text-xs">Rating</dt>
              {vendor.ratingKnown === false ? (
                <dd className="t-mute">No published rating</dd>
              ) : (
                <dd>
                  <span className="fig">{vendor.rating.toFixed(1)}</span> / 5{' '}
                  <span className="t-mute">({vendor.reviewsCount.toLocaleString()} reviews)</span>
                </dd>
              )}
            </div>
            <div>
              <dt className="t-mute text-xs">Billing</dt>
              <dd className="first-letter:uppercase">{vendor.pricing.contractTerm.replace(/_/g, ' ')}</dd>
              <dd className="t-mute text-xs">{vendor.slaGuarantee}</dd>
            </div>
          </dl>

          {vendor.pricing.studentDiscountNote && (
            <p>
              <span className="tag-sign mr-1.5">Student perk</span>
              {vendor.pricing.studentDiscountNote}
            </p>
          )}

          {(badges.length > 0 || vendor.complianceCertifications.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {badges.map((badge, i) => (
                <span key={`b${i}`} className="chip">{badge}</span>
              ))}
              {vendor.complianceCertifications.slice(0, 3).map((c, i) => (
                <span key={`c${i}`} className="chip">{c}</span>
              ))}
            </div>
          )}

          {vendor.keyFeatures.length > 0 && (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {vendor.keyFeatures.map((feat, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          )}

          {recommendations.length > 0 && (
            <div className="border-t b-rule pt-3">
              <span className="block font-semibold mb-1.5">Similar products to search</span>
              <div className="flex flex-wrap gap-1.5">
                {recommendations.map((rec, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelectRecommendation?.(rec.suggestedQuery)}
                    className="btn"
                    title={rec.note}
                  >
                    {rec.name}
                    <ArrowRight />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => onOpenRoi(result)} className="btn">
              <Calculator />
              Estimate savings
            </button>
            {ownPin && onRemoveQuote && (
              <button type="button" onClick={() => onRemoveQuote(vendor.id)} className="btn">
                <Trash2 />
                Remove this pin
              </button>
            )}
            {vendor.dataSource === 'quote' && onRemoveQuote && (
              <button type="button" onClick={() => onRemoveQuote(vendor.id)} className="btn">
                <Trash2 />
                Remove this quote
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
};
