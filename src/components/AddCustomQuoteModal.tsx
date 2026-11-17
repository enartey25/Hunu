import React, { useState } from 'react';
import { VendorService, ServiceCategory, ServiceType, GeoLocation } from '../engine/types';
import { ALL_SERVICE_CATEGORIES } from '../engine/vendorDatabase';
import { KNOWN_BUSINESS_HUBS } from '../engine/distance';
import { SUPPORTED_CURRENCIES, SupportedCurrency } from '../engine/currency';
import { productQuoteToVendor, readQuotedPrice } from '../engine/quote';
import { communityEnabled, shareQuote } from '../engine/communityPrices';
import { reverseArea } from '../engine/geolocation';
import { Plus, FileText, MapPinPlus } from 'lucide-react';
import { Dialog } from './Dialog';
import { PinPicker, PinPoint } from './map/PinPicker';

/** What is already known about the seller, when the quote is recorded from a shop's card. */
export interface QuotePrefill {
  sellerName?: string;
  phone?: string;
  location?: GeoLocation;
}

interface AddCustomQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveQuote: (quote: VendorService) => void;
  /** The user's own location, offered first so a local quote ranks as local. */
  home?: GeoLocation;
  /** The product being searched for, offered as the product the quote is for. */
  defaultProduct?: string;
  /** The currency a local seller would quote in. */
  defaultCurrency?: SupportedCurrency;
  /** The category the buyer is filtering by, so the quote is not filtered out of its own check. */
  category?: ServiceCategory;
  prefill?: QuotePrefill;
}

const HOME_VALUE = '__home__';

export const AddCustomQuoteModal: React.FC<AddCustomQuoteModalProps> = ({
  isOpen,
  onClose,
  onSaveQuote,
  home,
  defaultProduct = '',
  defaultCurrency = 'USD',
  category: filterCategory,
  prefill
}) => {
  const [mode, setMode] = useState<'product' | 'service'>('product');
  const [name, setName] = useState(prefill?.sellerName || '');

  // A product: one price, quoted at a counter or in a chat.
  const [product, setProduct] = useState(defaultProduct);
  const [price, setPrice] = useState('');
  const [quoteCurrency, setQuoteCurrency] = useState<SupportedCurrency>(defaultCurrency);
  const [area, setArea] = useState(prefill?.location?.city || '');
  const [phone, setPhone] = useState(prefill?.phone || '');
  const [message, setMessage] = useState('');
  const [readNote, setReadNote] = useState('');
  const [error, setError] = useState('');
  // Off until the buyer chooses: the quote is theirs.
  const [share, setShare] = useState(false);
  // Where the seller is, when the buyer pins it.
  const [picking, setPicking] = useState(false);
  const [sellerPoint, setSellerPoint] = useState<PinPoint | undefined>();
  const [areaFromMap, setAreaFromMap] = useState(false);
  const canShare = communityEnabled();

  // A service: a recurring price from a supplier.
  const [category, setCategory] = useState<ServiceCategory>('Lab Components & Hardware');
  const [serviceType, setServiceType] = useState<ServiceType>('hybrid');
  const [selectedCityHub, setSelectedCityHub] = useState(home ? HOME_VALUE : 'Austin, TX');
  const [baseMonthlyCost, setBaseMonthlyCost] = useState(500);
  const [pricingModel, setPricingModel] = useState<VendorService['pricing']['pricingModel']>('flat_monthly');
  const [contractTerm, setContractTerm] = useState<VendorService['pricing']['contractTerm']>('monthly');
  const [slaGuarantee, setSlaGuarantee] = useState('');
  const [certifications, setCertifications] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  if (!isOpen) return null;

  const handleMessage = (text: string) => {
    setMessage(text);
    const found = text.trim() ? readQuotedPrice(text, quoteCurrency) : undefined;
    if (!found) {
      setReadNote(text.trim() ? 'No price found in that message. Type it in above.' : '');
      return;
    }
    setPrice(String(found.amount));
    if (found.currency in SUPPORTED_CURRENCIES) setQuoteCurrency(found.currency as SupportedCurrency);
    setReadNote(`Read ${found.currency} ${found.amount.toLocaleString('en-US')} from the message. Check it is right.`);
  };

  const handleSellerPoint = (p: PinPoint) => {
    setSellerPoint(p);
    if (!area.trim() || areaFromMap) {
      void reverseArea(p.latitude, p.longitude).then((found) => {
        if (found) {
          setArea(found);
          setAreaFromMap(true);
        }
      });
    }
  };

  const submitProduct = () => {
    const base = prefill?.location || home || KNOWN_BUSINESS_HUBS[0];
    // A dropped pin is where the seller is; otherwise the map shop's place, or the buyer's.
    const location = sellerPoint ? { ...base, latitude: sellerPoint.latitude, longitude: sellerPoint.longitude } : base;
    const quote = productQuoteToVendor({
      product,
      amount: parseFloat(price),
      currency: quoteCurrency,
      sellerName: name,
      area,
      phone,
      category: filterCategory,
      location
    });
    if (!quote) {
      setError('Enter the product, the seller and a price above zero.');
      return;
    }
    onSaveQuote(quote);
    // Sent in the background; a failed share never blocks the check.
    if (canShare && share) void shareQuote(quote, !!sellerPoint || !!prefill?.location).catch(() => undefined);
    onClose();
  };

  const submitService = () => {
    const matchedHub =
      (selectedCityHub === HOME_VALUE && home) ||
      KNOWN_BUSINESS_HUBS.find((h) => `${h.city}, ${h.stateOrRegion}` === selectedCityHub) ||
      KNOWN_BUSINESS_HUBS[0];

    const certList = certifications
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    const sellerName = name.trim();
    const guarantee = slaGuarantee.trim();
    const site = websiteUrl.trim();
    const hasSite = /^https?:\/\/\S+\.\S+/.test(site);

    const newQuote: VendorService = {
      id: `custom-quote-${Date.now()}`,
      name: sellerName,
      category,
      serviceType,
      targetAudience: ['student', 'business', 'supply_chain'],
      location: {
        city: matchedHub.city,
        stateOrRegion: matchedHub.stateOrRegion,
        country: matchedHub.country,
        latitude: matchedHub.latitude,
        longitude: matchedHub.longitude,
        serviceRadiusKm: serviceType === 'local_physical' ? 100 : undefined
      },
      pricing: {
        baseMonthlyCost: Number(baseMonthlyCost),
        pricingModel,
        currency: 'USD',
        startingTierLabel: `$${baseMonthlyCost}/mo quoted`,
        contractTerm
      },
      targetIndustries: ['All'],
      targetHeadcount: ['1-10', '11-50', '51-200', '201-1000', '1000+'],
      complianceCertifications: certList,
      // A quote carries no public rating; it is scored as unrated rather than given one.
      rating: 0,
      reviewsCount: 0,
      ratingKnown: false,
      dataSource: 'quote',
      priceSource: 'quote',
      slaGuarantee: guarantee || 'No guarantee stated',
      summary: `A quote for ${category} that you added, from ${sellerName}.`,
      keyFeatures: ['Price quoted to you directly', `${contractTerm} billing`, guarantee].filter(Boolean),
      websiteUrl: hasSite
        ? site
        : `https://www.google.com/search?q=${encodeURIComponent(`${sellerName} ${matchedHub.city}`)}`
    };

    onSaveQuote(newQuote);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'product') submitProduct();
    else submitService();
  };

  const sellerField = (
    <label className="col-span-full">
      <span className="label">Seller name</span>
      <input
        type="text"
        required
        placeholder="The shop or supplier that quoted you"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="field"
      />
    </label>
  );

  return (
    <Dialog
      title="Check a quote"
      subtitle={
        mode === 'product'
          ? 'Hunu sizes it up against the offers it finds online'
          : 'Hunu scores it and ranks it with the other deals'
      }
      icon={<FileText />}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn">
            Cancel
          </button>
          <button type="submit" className="btn btn-ink">
            <Plus />
            {mode === 'product' ? 'Check this price' : 'Add and rank'}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-1.5 mb-3" role="group" aria-label="What the quote is for">
        <button
          type="button"
          onClick={() => setMode('product')}
          aria-pressed={mode === 'product'}
          className={`btn ${mode === 'product' ? 'is-on' : ''}`}
        >
          A product
        </button>
        <button
          type="button"
          onClick={() => setMode('service')}
          aria-pressed={mode === 'service'}
          className={`btn ${mode === 'service' ? 'is-on' : ''}`}
        >
          A monthly service
        </button>
      </div>

      {mode === 'product' ? (
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          <label className="col-span-full">
            <span className="label">Product</span>
            <input
              type="text"
              required
              placeholder="e.g. HP 15 laptop Core i5 8GB"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="field"
            />
          </label>

          <label>
            <span className="label">Price they quoted</span>
            <input
              type="number"
              required
              min="0.01"
              step="any"
              inputMode="decimal"
              placeholder="4200"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setError('');
              }}
              className="field"
            />
          </label>

          <label>
            <span className="label">Currency</span>
            <select
              value={quoteCurrency}
              onChange={(e) => setQuoteCurrency(e.target.value as SupportedCurrency)}
              className="field"
            >
              {(Object.keys(SUPPORTED_CURRENCIES) as SupportedCurrency[]).map((code) => (
                <option key={code} value={code}>
                  {code} · {SUPPORTED_CURRENCIES[code].name}
                </option>
              ))}
            </select>
          </label>

          {sellerField}

          <label>
            <span className="label">Where they are (optional)</span>
            <input
              type="text"
              placeholder={home ? `e.g. Circle. Left empty: ${home.city}` : 'e.g. Circle, Madina'}
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setAreaFromMap(false);
              }}
              className="field"
            />
          </label>

          <label>
            <span className="label">Their phone (optional)</span>
            <input
              type="tel"
              placeholder="024 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="field"
            />
          </label>

          <div className="col-span-full">
            {picking ? (
              <PinPicker
                center={prefill?.location || home || KNOWN_BUSINESS_HUBS[0]}
                value={sellerPoint}
                onChange={handleSellerPoint}
                label="Map: tap where the seller is"
              />
            ) : (
              <button type="button" onClick={() => setPicking(true)} className="btn" title="Put the seller on the map, so the deal shows where it is">
                <MapPinPlus />
                {prefill?.location ? 'Move the seller’s pin' : 'Pin the seller on a map'}
              </button>
            )}
          </div>

          <label className="col-span-full">
            <span className="label">Or paste their message (optional)</span>
            <textarea
              rows={2}
              placeholder="“I can do 4,200 cedis last price”"
              value={message}
              onChange={(e) => handleMessage(e.target.value)}
              className="field"
            />
            {readNote && (
              <span className="t-mute text-xs block mt-1" role="status">
                {readNote}
              </span>
            )}
          </label>

          {error && (
            <p className="col-span-full text-[13px]" role="alert">
              {error}
            </p>
          )}

          {canShare && (
            <label className="col-span-full flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={share}
                onChange={(e) => setShare(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Share this price with other Hunu users
                <span className="t-mute text-xs block">
                  Only the product, price, seller's name and area go out. Not you, and not their phone.
                </span>
              </span>
            </label>
          )}

          <p className="col-span-full t-mute text-xs">
            {share && canShare ? 'Also saved on this device.' : 'Saved on this device only.'}{' '}
            {sellerPoint || prefill?.location
              ? 'The deal is placed where the seller is.'
              : 'Without a pin, the deal is placed near you, and a shared price carries no map position.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          {sellerField}

          <label>
            <span className="label">Price quoted (USD per month)</span>
            <input
              type="number"
              required
              min="1"
              value={baseMonthlyCost}
              onChange={(e) => setBaseMonthlyCost(Number(e.target.value))}
              className="field"
            />
          </label>

          <label>
            <span className="label">How the price is charged</span>
            <select
              value={pricingModel}
              onChange={(e) => setPricingModel(e.target.value as VendorService['pricing']['pricingModel'])}
              className="field"
            >
              <option value="flat_monthly">Flat monthly price</option>
              <option value="per_user">Per person, per month</option>
              <option value="tiered">Tiered by size</option>
              <option value="hourly">Hourly or by usage</option>
            </select>
          </label>

          <label>
            <span className="label">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ServiceCategory)}
              className="field"
            >
              {ALL_SERVICE_CATEGORIES.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">Billing</span>
            <select
              value={contractTerm}
              onChange={(e) => setContractTerm(e.target.value as VendorService['pricing']['contractTerm'])}
              className="field"
            >
              <option value="monthly">Monthly, no lock-in</option>
              <option value="annual">Annual commitment</option>
              <option value="flexible">Flexible or by milestone</option>
            </select>
          </label>

          <label>
            <span className="label">Seller location</span>
            <select
              value={selectedCityHub}
              onChange={(e) => setSelectedCityHub(e.target.value)}
              className="field"
            >
              {home && (
                <option value={HOME_VALUE}>
                  {home.city}, {home.country} (near you)
                </option>
              )}
              {KNOWN_BUSINESS_HUBS.map((hub) => (
                <option key={`${hub.city}, ${hub.stateOrRegion}`} value={`${hub.city}, ${hub.stateOrRegion}`}>
                  {hub.city}, {hub.stateOrRegion}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">How you get it</span>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
              className="field"
            >
              <option value="local_physical">In person</option>
              <option value="hybrid">In person or online</option>
              <option value="digital_remote">Online only</option>
            </select>
          </label>

          <label className="col-span-full">
            <span className="label">Guarantee or response time (optional)</span>
            <input
              type="text"
              value={slaGuarantee}
              onChange={(e) => setSlaGuarantee(e.target.value)}
              placeholder="e.g. 7-day returns, reply within 24 hours"
              className="field"
            />
          </label>

          <label className="col-span-full">
            <span className="label">Certifications, comma separated (optional)</span>
            <input
              type="text"
              value={certifications}
              onChange={(e) => setCertifications(e.target.value)}
              placeholder="e.g. ISO-9001, RoHS"
              className="field"
            />
          </label>

          <label className="col-span-full">
            <span className="label">Seller website (optional)</span>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://"
              className="field"
            />
            <span className="t-mute text-xs block mt-1">
              Left empty, the offer button searches the web for the seller instead.
            </span>
          </label>
        </div>
      )}
    </Dialog>
  );
};
