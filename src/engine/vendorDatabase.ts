import { VendorService, ServiceCategory } from './types';

export const SEED_VENDORS: VendorService[] = [
  // ==========================================
  // --- REAL WORLD LAB WORK & ELECTRONICS HARDWARE DISTRIBUTORS ---
  // ==========================================
  {
    id: 'digikey-academic',
    name: 'DigiKey Electronics University & Lab Sourcing',
    category: 'Lab Components & Hardware',
    serviceType: 'hybrid',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: {
      city: 'Thief River Falls',
      stateOrRegion: 'MN',
      country: 'United States',
      latitude: 48.1191,
      longitude: -96.1811,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: 25,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: '15-20% Academic & Lab Discount',
      contractTerm: 'per_item',
      studentDiscountNote: 'Verified .edu/university students receive academic tier pricing and free engineering toolkits.'
    },
    targetIndustries: ['All', 'Hardware & Engineering', 'Academic Research'],
    targetHeadcount: ['1-10', '11-50', '51-200', '201-1000', '1000+'],
    complianceCertifications: ['ISO-9001', 'RoHS Compliant', 'ANSI/ESD S20.20'],
    rating: 4.9,
    reviewsCount: 4200,
    slaGuarantee: 'Same-day dispatch on in-stock components & global DHL express',
    summary: 'The premier worldwide distributor for lab components, microcontrollers, semiconductors, passives, and electronic lab test gear with academic discounts.',
    keyFeatures: [
      '15-20% Student & Lab discount on components',
      'Over 15 million parts catalog (STM32, ESP32, Texas Instruments, Analog Devices)',
      'Global DHL/FedEx academic express delivery',
      'Free component datasheets and reference schematics'
    ],
    websiteUrl: 'https://www.digikey.com'
  },
  {
    id: 'mouser-electronics',
    name: 'Mouser Electronics Lab & R&D Components',
    category: 'Lab Components & Hardware',
    serviceType: 'hybrid',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: {
      city: 'Dallas',
      stateOrRegion: 'TX',
      country: 'United States',
      latitude: 32.7767,
      longitude: -96.797,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: 20,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: 'Student & Lab Bulk Tiers',
      contractTerm: 'per_item',
      studentDiscountNote: 'Free engineering resources and educational discounts on development boards.'
    },
    targetIndustries: ['All', 'Hardware & Engineering', 'Academic Research'],
    targetHeadcount: ['1-10', '11-50', '51-200'],
    complianceCertifications: ['ISO-9001', 'AS9100D', 'ITAR Registered'],
    rating: 4.8,
    reviewsCount: 3800,
    slaGuarantee: 'Same-day order processing with zero minimum order quantities',
    summary: 'Global authorized distributor of semiconductors, electronic components, and laboratory testing equipment supporting student capstone and research labs.',
    keyFeatures: [
      'Zero minimum order quantity for student experiments',
      'Development kits from Raspberry Pi, Arduino, NXP, Microchip',
      'Oscilloscopes, multimeters, and soldering station hardware',
      'Direct factory traceable components'
    ],
    websiteUrl: 'https://www.mouser.com'
  },
  {
    id: 'jlcpcb-lcsc-prototyping',
    name: 'JLCPCB & LCSC Low-Cost Lab Hardware & PCBs',
    category: 'Lab Components & Hardware',
    serviceType: 'digital_remote',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: {
      city: 'Hong Kong',
      stateOrRegion: 'Hong Kong',
      country: 'Hong Kong',
      latitude: 22.3193,
      longitude: 114.1694,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: 2,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: '$2 Custom PCB Prototypes + SMT Assembly',
      contractTerm: 'per_item',
      studentDiscountNote: '$54 student coupon pack for engineering capstone projects.'
    },
    targetIndustries: ['All', 'Hardware & Engineering'],
    targetHeadcount: ['1-10', '11-50'],
    complianceCertifications: ['ISO-9001', 'IPC-6012 Class 2', 'RoHS'],
    rating: 4.8,
    reviewsCount: 5600,
    slaGuarantee: '24-hour turnaround on 2-layer prototype circuit boards',
    summary: 'The most cost-effective hardware prototyping and component sourcing platform for student research projects, robotics clubs, and hardware startups.',
    keyFeatures: [
      'Custom PCB manufacturing starting at $2 for 5 boards',
      'Turnkey SMT component pick-and-place assembly',
      'Over 350,000 in-stock low-cost electronic components',
      'Worldwide academic shipping with tracking'
    ],
    websiteUrl: 'https://jlcpcb.com'
  },
  {
    id: 'adafruit-sparkfun-kits',
    name: 'Adafruit & SparkFun Academic Electronics',
    category: 'Lab Components & Hardware',
    serviceType: 'digital_remote',
    targetAudience: ['student', 'business'],
    location: {
      city: 'New York',
      stateOrRegion: 'NY',
      country: 'United States',
      latitude: 40.7128,
      longitude: -74.006,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: 15,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: '10% University & Lab Educator Pack',
      contractTerm: 'per_item',
      studentDiscountNote: '10% educational discount on learning boards, microcontrollers, and sensors.'
    },
    targetIndustries: ['All', 'Academic Research', 'Hardware & Engineering'],
    targetHeadcount: ['1-10', '11-50'],
    complianceCertifications: ['Open Source Hardware (OSHW)', 'FCC Compliant'],
    rating: 4.9,
    reviewsCount: 2900,
    slaGuarantee: 'Open-source tutorials, code libraries, and 24h technical forum support',
    summary: 'Maker, lab, and university kits designed for rapid embedded systems prototyping, sensor integration, IoT experiments, and robotics.',
    keyFeatures: [
      'CircuitPython and Arduino compatible modules',
      'Sensor breakout boards (IMU, environmental, biosensors)',
      '10% discount for students, labs, and educators',
      'Comprehensive step-by-step lab wiring guides'
    ],
    websiteUrl: 'https://www.adafruit.com'
  },

  // ==========================================
  // --- STUDENT FLIGHTS & TRAVEL DEALS ---
  // ==========================================
  {
    id: 'student-universe-travel',
    name: 'StudentUniverse Verified Student Flights',
    category: 'Student Flights & Travel',
    serviceType: 'digital_remote',
    targetAudience: ['student'],
    location: {
      city: 'Boston',
      stateOrRegion: 'MA',
      country: 'United States',
      latitude: 42.3601,
      longitude: -71.0589,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: 0,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: 'Up to 30% Off Commercial Flights',
      contractTerm: 'one_time',
      studentDiscountNote: 'Exclusive student and under-26 flight discounts with free date changes on select carriers.'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10'],
    complianceCertifications: ['IATA Certified', 'ARC Accredited', 'ABTA Bonded'],
    rating: 4.7,
    reviewsCount: 8400,
    slaGuarantee: '24/7 Student traveler helpline and emergency rebooking assistance',
    summary: 'The global leader in student and youth travel, offering negotiated discount flight rates with British Airways, Delta, Emirates, Lufthansa, and United.',
    keyFeatures: [
      'Up to $250 off roundtrip international flights for students',
      'Flexible cancellation and low-cost change fees for university terms',
      'Valid for all registered university, college, and study-abroad students',
      'Promo codes stackable with youth airline discounts'
    ],
    websiteUrl: 'https://www.studentuniverse.com'
  },
  {
    id: 'qatar-student-club',
    name: 'Qatar Airways Global Student Club Fares',
    category: 'Student Flights & Travel',
    serviceType: 'digital_remote',
    targetAudience: ['student'],
    location: {
      city: 'Doha',
      stateOrRegion: 'Ad Dawhah',
      country: 'Qatar',
      latitude: 25.2854,
      longitude: 51.531,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: 0,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: '10-20% Off Flights + +10kg Free Baggage',
      contractTerm: 'one_time',
      studentDiscountNote: '10% off 1st booking, 15% off 2nd booking, 20% off 3rd booking + free baggage.'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10'],
    complianceCertifications: ['Skytrax 5-Star Airline', 'IATA Compliant'],
    rating: 4.8,
    reviewsCount: 5200,
    slaGuarantee: 'Free date change flexibility for academic semester schedules',
    summary: 'Dedicated international student travel program connecting Africa, Europe, the Americas, Asia, and the Middle East with student perks.',
    keyFeatures: [
      '10% to 20% tier discounts on international student fares',
      'Additional 10 kg (or 1 extra piece) free checked baggage allowance',
      'Free Super Wi-Fi access on board',
      'Companion pass discount for visiting family'
    ],
    websiteUrl: 'https://www.qatarairways.com/en/student-club.html'
  },

  // ==========================================
  // --- STUDENT SOFTWARE & OFFERS ---
  // ==========================================
  {
    id: 'github-student-pack',
    name: 'GitHub Student Developer Pack ($200k+ Free Tools)',
    category: 'Student Software & Offers',
    serviceType: 'digital_remote',
    targetAudience: ['student'],
    location: {
      city: 'San Francisco',
      stateOrRegion: 'CA',
      country: 'United States',
      latitude: 37.7749,
      longitude: -122.4194
    },
    pricing: {
      baseMonthlyCost: 0,
      pricingModel: 'flat_monthly',
      currency: 'USD',
      startingTierLabel: '100% Free for University Students',
      contractTerm: 'flexible',
      studentDiscountNote: 'Free access to GitHub Pro, DigitalOcean $200 credits, JetBrains, Namecheap domain, and Datadog.'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10'],
    complianceCertifications: ['SOC-2 Type II', 'ISO-27001'],
    rating: 5.0,
    reviewsCount: 18000,
    slaGuarantee: 'Instant verification via university email or student ID',
    summary: 'The ultimate academic developer suite giving students free access to industry-standard development tools, cloud credits, and design apps.',
    keyFeatures: [
      'Free GitHub Pro with Copilot AI access for verified students',
      '$200 DigitalOcean cloud infrastructure credits',
      'Free 1-year .me domain name and SSL certificate from Namecheap',
      'Free JetBrains, Canva Pro, Sentry, and 100+ other developer tools'
    ],
    websiteUrl: 'https://education.github.com/pack'
  },
  {
    id: 'notion-figma-education',
    name: 'Notion Plus & Figma Professional for Students',
    category: 'Student Software & Offers',
    serviceType: 'digital_remote',
    targetAudience: ['student'],
    location: {
      city: 'San Francisco',
      stateOrRegion: 'CA',
      country: 'United States',
      latitude: 37.7749,
      longitude: -122.4194
    },
    pricing: {
      baseMonthlyCost: 0,
      pricingModel: 'flat_monthly',
      currency: 'USD',
      startingTierLabel: '100% Free ($120/yr saved)',
      contractTerm: 'flexible',
      studentDiscountNote: 'Free Notion Plus Plan ($10/mo value) and Figma Professional ($15/mo value) for students.'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10'],
    complianceCertifications: ['SOC-2 Type II', 'GDPR Compliant'],
    rating: 4.9,
    reviewsCount: 9500,
    slaGuarantee: 'Unlimited file uploads and collaborative shared workspaces',
    summary: 'Free professional software licenses for student notes, capstone project tracking, research paper drafting, and UI/UX design.',
    keyFeatures: [
      'Notion Plus plan free for all students with university email',
      'Figma Professional design and FigJam whiteboarding 100% free',
      'Unlimited workspace members and version history',
      'Export notes and designs directly to PDF and presentations'
    ],
    websiteUrl: 'https://www.notion.so/product/notion-for-education'
  },

  // ==========================================
  // --- FOOD & CAMPUS DINING OFFERS ---
  // ==========================================
  {
    id: 'doordash-dashpass-student',
    name: 'DoorDash DashPass for Students & Campus Dining',
    category: 'Food & Campus Dining',
    serviceType: 'local_physical',
    targetAudience: ['student'],
    location: {
      city: 'San Francisco',
      stateOrRegion: 'CA',
      country: 'United States',
      latitude: 37.7749,
      longitude: -122.4194,
      serviceRadiusKm: 50
    },
    pricing: {
      baseMonthlyCost: 4.99,
      pricingModel: 'flat_monthly',
      currency: 'USD',
      startingTierLabel: '$4.99/mo (50% Off Regular DashPass)',
      contractTerm: 'monthly',
      studentDiscountNote: '50% student discount on DashPass with $0 delivery fees on campus food orders.'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10'],
    complianceCertifications: ['Verified Student Status via SheerID'],
    rating: 4.7,
    reviewsCount: 6300,
    slaGuarantee: 'Average 30-minute delivery from local campus eateries and groceries',
    summary: 'Discounted food delivery and grocery savings for college students, offering $0 delivery fees on orders over $12 and 5% back on pickups.',
    keyFeatures: [
      '$0 delivery fees on food, snacks, and groceries near campus',
      '5% back on pickup orders at participating local restaurants',
      'Exclusive student weekly $5 off meal promotions',
      'Cancel anytime with no lock-in'
    ],
    websiteUrl: 'https://www.doordash.com/dashpass/student/'
  },
  {
    id: 'too-good-to-go',
    name: 'Too Good To Go Surplus Meals & Grocery Deals',
    category: 'Food & Campus Dining',
    serviceType: 'local_physical',
    targetAudience: ['student', 'business'],
    location: {
      city: 'Accra',
      stateOrRegion: 'Greater Accra',
      country: 'Ghana',
      latitude: 5.556,
      longitude: -0.197,
      serviceRadiusKm: 25
    },
    pricing: {
      baseMonthlyCost: 4,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: '$4 - $6 for $15+ Worth of Fresh Meals',
      contractTerm: 'per_item',
      studentDiscountNote: 'Up to 70% discount on fresh meals, baked goods, and groceries from local partners.'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10'],
    complianceCertifications: ['Food Safety Certified', 'Zero Waste Partner'],
    rating: 4.8,
    reviewsCount: 11200,
    slaGuarantee: 'Guaranteed fresh daily surplus from vetted bakeries, markets, and eateries',
    summary: 'Save up to 70% on fresh meals, restaurant food, and local groceries by reserving surplus surprise bags from local food providers near your location.',
    keyFeatures: [
      'Huge student budget savings (meals typically 1/3 of regular price)',
      'Direct pickup from local bakeries, cafes, and supermarkets near campus',
      'Real-time notifications when food is released nearby',
      'Reduces community food waste'
    ],
    websiteUrl: 'https://toogoodtogo.com'
  },

  // ==========================================
  // --- SUPPLY CHAIN, FREIGHT & 3PL ---
  // ==========================================
  {
    id: 'flexport-supply-chain',
    name: 'Flexport Global Supply Chain & Bulk Ocean/Air Freight',
    category: 'Supply Chain & Bulk Freight',
    serviceType: 'hybrid',
    targetAudience: ['supply_chain', 'business'],
    location: {
      city: 'San Francisco',
      stateOrRegion: 'CA',
      country: 'United States',
      latitude: 37.7749,
      longitude: -122.4194,
      serviceRadiusKm: 20000
    },
    pricing: {
      baseMonthlyCost: 850,
      pricingModel: 'usage_based',
      currency: 'USD',
      startingTierLabel: 'Direct Container & Pallet Carrier Rates',
      contractTerm: 'flexible'
    },
    targetIndustries: ['Logistics & Supply Chain', 'Manufacturing & Hardware', 'E-commerce & Retail'],
    targetHeadcount: ['11-50', '51-200', '201-1000', '1000+'],
    complianceCertifications: ['C-TPAT Tier 3', 'FMC Licensed', 'IATA Certified', 'Customs Brokerage'],
    rating: 4.8,
    reviewsCount: 780,
    slaGuarantee: 'Full visibility with live GPS ocean/air cargo container tracking',
    summary: 'Cloud-native digital freight forwarding platform managing container shipping, air cargo, customs clearance, and port drayage worldwide.',
    keyFeatures: [
      'Real-time ocean, air, and ground freight booking and tracking',
      'Automated customs brokerage and tariff classification',
      'Consolidation services for smaller LCL pallet shipments',
      'End-to-end supply chain milestone visibility'
    ],
    websiteUrl: 'https://www.flexport.com'
  },
  {
    id: 'shipbob-fulfillment',
    name: 'ShipBob Omnichannel 3PL Logistics',
    category: '3PL Warehousing & Logistics',
    serviceType: 'local_physical',
    targetAudience: ['supply_chain', 'business'],
    location: {
      city: 'Chicago',
      stateOrRegion: 'IL',
      country: 'United States',
      latitude: 41.8781,
      longitude: -87.6298,
      serviceRadiusKm: 2500
    },
    pricing: {
      baseMonthlyCost: 350,
      pricingModel: 'usage_based',
      currency: 'USD',
      startingTierLabel: 'Pay as you ship ($5.50/pick)',
      contractTerm: 'flexible'
    },
    targetIndustries: ['E-commerce & Retail', 'Manufacturing & Hardware'],
    targetHeadcount: ['1-10', '11-50', '51-200', '201-1000'],
    complianceCertifications: ['FDA Registered', 'ISO-9001', 'Hazardous Materials Certified'],
    rating: 4.7,
    reviewsCount: 890,
    slaGuarantee: 'Same-day order fulfillment cut-off at 2:00 PM',
    summary: 'Nationwide warehouse fulfillment network with 50+ distribution nodes ensuring 2-day ground shipping across North America.',
    keyFeatures: [
      'Distributed inventory algorithms',
      'Shopify & Amazon 2-way sync',
      'B2B EDI freight palletization',
      'Custom unboxing & kitting'
    ],
    websiteUrl: 'https://shipbob.com'
  },

  // ==========================================
  // --- B2B CORPORATE SOFTWARE, LEGAL & HR ---
  // ==========================================
  {
    id: 'rippling-allinone',
    name: 'Rippling Unified HR & IT Cloud',
    category: 'Payroll & HR',
    serviceType: 'digital_remote',
    targetAudience: ['business'],
    location: {
      city: 'San Francisco',
      stateOrRegion: 'CA',
      country: 'United States',
      latitude: 37.7749,
      longitude: -122.4194
    },
    pricing: {
      baseMonthlyCost: 8,
      pricingModel: 'per_user',
      currency: 'USD',
      startingTierLabel: '$8 / employee / month',
      contractTerm: 'annual',
      freeTrialDays: 14
    },
    targetIndustries: ['SaaS / Software', 'Fintech / Banking', 'Healthcare & Life Sciences', 'E-commerce & Retail'],
    targetHeadcount: ['1-10', '11-50', '51-200', '201-1000', '1000+'],
    complianceCertifications: ['SOC-2 Type II', 'HIPAA Ready', 'ISO-27001', 'Multi-state tax registered'],
    rating: 4.8,
    reviewsCount: 1540,
    slaGuarantee: '99.95% Payroll uptime & instant device deployment',
    summary: 'All-in-one workforce platform managing global payroll, benefits, corporate cards, and IT hardware in a single flow.',
    keyFeatures: ['90-second onboarding', 'Global payroll across 140+ countries', 'Automated tax filings', 'Computer procurement & MDM'],
    websiteUrl: 'https://rippling.com'
  },
  {
    id: 'pilot-cpa',
    name: 'Pilot Bookkeeping & R&D Tax',
    category: 'Accounting & Tax',
    serviceType: 'hybrid',
    targetAudience: ['business'],
    location: {
      city: 'San Francisco',
      stateOrRegion: 'CA',
      country: 'United States',
      latitude: 37.7749,
      longitude: -122.4194,
      serviceRadiusKm: 2500
    },
    pricing: {
      baseMonthlyCost: 499,
      pricingModel: 'tiered',
      currency: 'USD',
      startingTierLabel: 'Core Bookkeeping',
      contractTerm: 'annual',
      freeTrialDays: 0
    },
    targetIndustries: ['SaaS / Software', 'Fintech / Banking', 'E-commerce & Retail'],
    targetHeadcount: ['1-10', '11-50', '51-200'],
    complianceCertifications: ['AICPA', 'SOC-2 Type II', 'GAAP Compliant'],
    rating: 4.8,
    reviewsCount: 310,
    slaGuarantee: 'Dedicated CPA & 24h Inquiry Response',
    summary: 'Specialized bookkeeping, tax preparation, and fractional CFO advisory for venture-backed and growth companies.',
    keyFeatures: ['Accrual accounting', 'R&D tax credit claim filing', 'QuickBooks & Stripe sync', 'Monthly investor financial pack'],
    websiteUrl: 'https://pilot.com'
  },
  {
    id: 'cloudflare-enterprise',
    name: 'Cloudflare Zero Trust & Edge Network',
    category: 'Cloud Infrastructure & DevOps',
    serviceType: 'digital_remote',
    targetAudience: ['business', 'student'],
    location: {
      city: 'San Francisco',
      stateOrRegion: 'CA',
      country: 'United States',
      latitude: 37.7749,
      longitude: -122.4194
    },
    pricing: {
      baseMonthlyCost: 20,
      pricingModel: 'tiered',
      currency: 'USD',
      startingTierLabel: 'Pro & Free Academic Tiers Available',
      contractTerm: 'monthly'
    },
    targetIndustries: ['SaaS / Software', 'E-commerce & Retail', 'Fintech / Banking', 'Healthcare & Life Sciences'],
    targetHeadcount: ['1-10', '11-50', '51-200', '201-1000', '1000+'],
    complianceCertifications: ['PCI-DSS Level 1', 'SOC-2 Type II', 'HIPAA', 'ISO-27001'],
    rating: 4.9,
    reviewsCount: 3800,
    slaGuarantee: '100% Uptime SLA for enterprise tiers',
    summary: 'Global edge network providing DDoS mitigation, Web Application Firewall (WAF), DNS, and Zero Trust access.',
    keyFeatures: ['Unlimited enterprise DDoS protection', 'Global CDN latency sub-50ms', 'Zero Trust private access', 'Bot management engine'],
    websiteUrl: 'https://cloudflare.com'
  }
];

export const ALL_SERVICE_CATEGORIES: { category: ServiceCategory; label: string; audience: 'b2b' | 'student' | 'supply_chain' | 'all' }[] = [
  { category: 'General Products & Retail', label: 'General Products', audience: 'all' },
  { category: 'Lab Components & Hardware', label: 'Lab Components & Hardware', audience: 'all' },
  { category: 'Student Flights & Travel', label: 'Student Flights & Travel', audience: 'student' },
  { category: 'Student Software & Offers', label: 'Student Software & Offers', audience: 'student' },
  { category: 'Food & Campus Dining', label: 'Food & Campus Dining', audience: 'student' },
  { category: 'Supply Chain & Bulk Freight', label: 'Supply Chain & Freight', audience: 'supply_chain' },
  { category: '3PL Warehousing & Logistics', label: '3PL Warehousing', audience: 'supply_chain' },
  { category: 'Cloud Infrastructure & DevOps', label: 'Cloud & DevOps', audience: 'b2b' },
  { category: 'Accounting & Tax', label: 'Accounting & Tax', audience: 'b2b' },
  { category: 'Legal & Compliance', label: 'Legal & Compliance', audience: 'b2b' },
  { category: 'Payroll & HR', label: 'Payroll & HR', audience: 'b2b' },
  { category: 'Enterprise Cybersecurity', label: 'Cybersecurity', audience: 'b2b' },
  { category: 'B2B Marketing & Sales', label: 'B2B Marketing', audience: 'b2b' },
  { category: 'Facilities & Commercial Equipment', label: 'Facilities & Commercial', audience: 'b2b' }
];
