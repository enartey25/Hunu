export type HeadcountRange = '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';

export type BudgetTier = 'Bootstrap' | 'Growth' | 'Mid-Market' | 'Enterprise';

export type ContractTerm = 'monthly' | 'annual' | 'flexible' | 'per_item' | 'one_time';

export type ServiceType = 'local_physical' | 'hybrid' | 'digital_remote';

export type UserRole = 'business' | 'student';

export type ServiceCategory =
  | 'Accounting & Tax'
  | 'Legal & Compliance'
  | 'Payroll & HR'
  | 'Cloud Infrastructure & DevOps'
  | '3PL Warehousing & Logistics'
  | 'Supply Chain & Bulk Freight'
  | 'Lab Components & Hardware'
  | 'Student Flights & Travel'
  | 'Student Software & Offers'
  | 'Food & Campus Dining'
  | 'Enterprise Cybersecurity'
  | 'B2B Marketing & Sales'
  | 'Facilities & Commercial Equipment'
  | 'General Products & Retail';

export interface GeoLocation {
  city: string;
  stateOrRegion: string;
  country: string;
  latitude: number;
  longitude: number;
  organization?: string;
}

export interface PriorityWeights {
  priceWeight: number;    // Weight for cost efficiency (0 to 1)
  locationWeight: number; // Weight for proximity / local presence (0 to 1)
  fitWeight: number;      // Weight for industry, student, and scale fit (0 to 1)
  qualityWeight: number;  // Weight for rating, SLA, and verification (0 to 1)
}

export interface StudentProfile {
  institution: string; // e.g. 'University of Ghana'
  majorOrDepartment: string; // e.g. 'Electrical Engineering / Computer Science'
  academicLevel: 'Undergraduate' | 'Graduate / Masters' | 'PhD / Research';
  hasEduEmail: boolean;
}

export interface CompanyProfile {
  id: string;
  userRole: UserRole;
  companyName: string; // Or student name / team
  industry: string;
  headcount: HeadcountRange;
  budgetTier: BudgetTier;
  studentProfile?: StudentProfile;
  location: GeoLocation & {
    maxPreferredDistanceKm: number; // 0 means any / remote acceptable
  };
  priorityWeights: PriorityWeights;
  preferredContract: 'any' | 'monthly' | 'annual';
}

export interface VendorPricing {
  baseMonthlyCost: number;
  pricingModel: 'per_user' | 'flat_monthly' | 'tiered' | 'usage_based' | 'hourly' | 'per_unit';
  currency: string;
  startingTierLabel: string;
  contractTerm: ContractTerm;
  setupFee?: number;
  freeTrialDays?: number;
  studentDiscountNote?: string;
}

export interface VendorService {
  id: string;
  name: string;
  category: ServiceCategory;
  serviceType: ServiceType;
  targetAudience: ('business' | 'student' | 'supply_chain')[];
  location: GeoLocation & {
    serviceRadiusKm?: number;
  };
  pricing: VendorPricing;
  targetIndustries: string[];
  targetHeadcount: HeadcountRange[];
  complianceCertifications: string[];
  rating: number; // 1.0 - 5.0
  reviewsCount: number;
  slaGuarantee: string;
  summary: string;
  keyFeatures: string[];
  websiteUrl: string;
  hasOfficialWebsite?: boolean;
  exactOrderUrl?: string;
  contactEmail?: string;
  phone?: string;

  // --- Provenance. Everything below is optional; absent means "catalogue or user-entered". ---
  /** Where this row came from. */
  dataSource?: 'catalogue' | 'web' | 'local' | 'quote' | 'page' | 'community' | 'pinned';
  /** False when no price could be read for this offer. A zero cost then means "unknown", not "free". */
  priceKnown?: boolean;
  /** How the price was obtained. 'page' is structured data on the seller's own page. */
  priceSource?: 'page' | 'snippet' | 'catalogue' | 'quote';
  /** False when no rating was published. `rating` and `reviewsCount` are then 0 and must not be shown. */
  ratingKnown?: boolean;
  /** False when the seller's physical location is not known (most web listings). */
  locationKnown?: boolean;
  availability?: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  /** The seller's own previous (struck-through) price in USD, when it states one above the current price. */
  listPriceUSD?: number;
  /** The seller's stated markdown against that previous price, in percent. */
  discountPercent?: number;
  /** Opening hours as published (local stores). */
  openingHours?: string;
  /**
   * Relevance floor in [0, 1] for rows matched by something other than text,
   * e.g. a local electronics shop returned for a component query.
   */
  relevanceHint?: number;
  /** Short statement of why the row was matched, shown with the hint. */
  matchBasis?: string;

  // --- A price a seller quoted the buyer in person or in a chat. ---
  /** The product the quote was for, as the buyer named it. */
  quotedProduct?: string;
  /** The price as quoted, before conversion. */
  quotedPrice?: { amount: number; currency: string };
  /** When the quote was recorded (ms since epoch). Quoted prices go stale. */
  quotedAt?: number;

  // --- A price another Hunu user was quoted and chose to share. ---
  /** The shared report this row came from. Present only on `dataSource: 'community'` rows. */
  communityReport?: { id: number; confirmations: number };
  /** The shared shop pin this row came from. Present only on shared dataSource: 'pinned' rows. */
  communityShop?: { id: number; confirmations: number };
  /** When the shop was pinned (ms since epoch). Present on dataSource: 'pinned' rows. */
  pinnedAt?: number;

  // --- Delivery and trust, as the seller or its platform published them. ---
  /** What the seller itself states delivery costs to the buyer: on its page or at its checkout. */
  delivery?: SellerDelivery;
  /** What the platform publishes about the seller (a Jiji advertiser, a marketplace shop). */
  seller?: SellerInfo;

  // --- A fare for a trip. ---
  trip?: TripFare;
}

/** One way to make a trip, and how its price is known. */
export interface TripFare {
  mode: 'flight' | 'bus';
  from: string;
  to: string;
  /** Airline or bus company. */
  operator: string;
  /** "Executive coach", "Economy". */
  service?: string;
  /** ISO date-time of departure, when the fare is for a specific flight. */
  departAt?: string;
  returnAt?: string;
  /** 0 for non-stop. */
  stops?: number;
  durationMin?: number;
  /**
   * 'seen': a price travellers were shown recently (cached, may have changed).
   * 'published': the operator's own fare list. 'from': the lowest it advertises.
   * 'unknown': the operator publishes no fare Hunu could read.
   */
  priceKind: 'seen' | 'published' | 'from' | 'unknown';
  /** When the price was seen or published, "2026-11-15". */
  checkedOn?: string;
  sourceName?: string;
  sourceUrl?: string;
  note?: string;
  passengers: number;
}

/** A delivery charge stated by the seller, never estimated by Hunu. */
export interface SellerDelivery {
  /** 'free' is a stated charge of zero. */
  kind: 'exact' | 'free';
  amount: number;
  currency: string;
  /** Where it was read: "Product page", "CompuGhana checkout for Greater Accra". */
  basis: string;
  /** A condition the seller attaches: "Only within close areas of Accra & Tema". */
  condition?: string;
  transit?: string;
  sourceUrl?: string;
  /** When it was read (ms since epoch). */
  checkedAt?: number;
}

export interface SellerInfo {
  name?: string;
  /** The seller's own rating on the platform, 0 to 5. */
  rating?: number;
  ratingCount?: number;
  /** The platform checked the seller's identity. */
  verifiedId?: boolean;
  /** Whole years the seller has been on the platform ("3+ years on Jiji" is 3). */
  yearsActive?: number;
  /** The brand's own store on a marketplace. */
  officialStore?: boolean;
  /** The ad's position was paid for. */
  paidPlacement?: boolean;
  /** The platform's id for the seller, used to key ratings from Hunu users. */
  platformId?: string;
}

export type DeliveryKind = 'exact' | 'free' | 'range' | 'pickup' | 'unknown';

/** What getting the item to the buyer costs, and how sure Hunu is of it. */
export interface DeliveryEstimate {
  kind: DeliveryKind;
  /**
   * The figure used to rank and to sum the landed cost: the stated charge, the middle
   * of a range, or for 'unknown' a ranking assumption that is never shown as a price.
   */
  estimatedCostUSD: number;
  /** Bounds in USD. Equal for 'exact', 'free' and 'pickup'; absent for 'unknown'. */
  minUSD?: number;
  maxUSD?: number;
  isFreeShipping: boolean;
  freeShippingThresholdUSD?: number;
  deliveryEstimate: string;
  courierName: string;
  originCity: string;
  destinationCity: string;
  /** One sentence on where the figure came from. */
  basis: string;
  condition?: string;
  sourceUrl?: string;
  /** When the source was read, "2026-11-16". */
  checkedOn?: string;
  /** Imported goods: duty and VAT are charged on top. */
  importChargesMayApply?: boolean;
}

export interface ScoreBreakdown {
  priceScore: number;      // 0 - 100
  locationScore: number;   // 0 - 100
  fitScore: number;        // 0 - 100
  qualityScore: number;    // 0 - 100
  /** How well the offer matches the search, 0 - 100. Absent when there is no query. */
  relevanceScore?: number;
  distanceKm?: number;
}

export type PriceConfidence = 'live' | 'snippet' | 'catalogue' | 'quote' | 'unknown';

export interface ROIEstimate {
  annualCostEst: number;
  industryAvgAnnualCost: number;
  estimatedSavingsVsAvg: number;
  savingsPercent: number;
}

export interface ScoredVendorResult {
  vendor: VendorService;
  totalValueScore: number; // 0 - 100
  breakdown: ScoreBreakdown;
  badges: string[];
  roiEstimate: ROIEstimate;
  shippingEstimate: DeliveryEstimate;
  /** How far the buyer can trust this offer, from the product's, seller's and store's record. */
  trust?: import('./trust').TrustAssessment;
  totalLandedCost: number; // Base item/annual cost + shipping cost
  /** How far the price can be trusted. */
  priceConfidence?: PriceConfidence;
  /** What the price was compared against: other offers found, or a category benchmark. */
  priceBasis?: 'peers' | 'benchmark' | 'none';
  /** Number of comparable priced offers behind `priceBasis: 'peers'`. */
  peerCount?: number;
  /** Plain-language reasons for the rank, strongest first. */
  reasons?: string[];
  /** A case, charger or other add-on to the product searched for, shown only on request. */
  accessory?: boolean;
  activeDeal?: {
    title: string;
    description: string;
    discountPercent?: number;
    discountFixedUSD?: number;
    promoCode?: string;
    claimUrl: string;
    source: string;
    /** False for discounts read off the open web. Those are shown but never applied to the price. */
    verified?: boolean;
  };
}

export interface SearchFilterOptions {
  query?: string;
  category?: ServiceCategory | 'All';
  targetAudience?: 'all' | 'business' | 'student' | 'supply_chain';
  maxMonthlyBudget?: number;
  maxDistanceKm?: number;
  requiredCertifications?: string[];
  contractPreference?: 'any' | 'monthly' | 'annual';
  minRating?: number;
  sortBy?: 'value_score' | 'price_asc' | 'distance_asc' | 'rating_desc';
  /** Keep cases, chargers and other add-ons in a search for the device itself. Off by default. */
  includeAccessories?: boolean;
}

/** True unless a source explicitly said it could not read a price. */
export function isPriceKnown(vendor: VendorService): boolean {
  return vendor.priceKnown !== false;
}

/** True unless a source explicitly said no rating was published. */
export function isRatingKnown(vendor: VendorService): boolean {
  return vendor.ratingKnown !== false;
}

/** One-off purchases (a product, a ticket) as opposed to recurring services. */
export function isOneOffPurchase(vendor: VendorService): boolean {
  const term = vendor.pricing.contractTerm;
  return term === 'per_item' || term === 'one_time';
}
