import { GeoLocation, TripFare, VendorService } from './types';
import { Trip } from './tripParser';
import { faresFor, unpublishedFor } from './ghanaTransport';
import { toUSD } from './currency';
import { HUNU_API_URL, communityEnabled } from './communityPrices';

/**
 * Fares for a trip, as ranked rows:
 * - flights travellers were shown recently, from Hunu's API (Aviasales data);
 * - fares Ghana's bus companies and airlines publish (ghanaTransport.ts);
 * - operators that run the route but publish no fare, with where to check it.
 */

/** A fare as Hunu's API returns it. */
export interface ApiFare {
  airline: string;
  airlineName?: string;
  flightNumber?: string;
  departAt: string;
  returnAt?: string;
  stops: number;
  durationMin?: number;
  /** Total for the requested passengers, in `currency`. */
  price: number;
  currency: string;
  /** Booking link (already carrying Hunu's partner marker). */
  link: string;
  /** When travellers were shown this price, "2026-11-15". */
  seenOn?: string;
}

export interface FareCalendarDay {
  date: string;
  price: number;
  currency: string;
}

export interface TravelResult {
  rows: VendorService[];
  /** Cheapest fare seen per day around the date, for the date strip. */
  calendar: FareCalendarDay[];
  /** Why flights could not be shown, when they could not. */
  flightIssue?: string;
}

const CATEGORY = 'Student Flights & Travel' as const;

function baseRow(id: string, name: string, fare: TripFare, priceGHS: number | undefined, url: string, buyer: GeoLocation): VendorService {
  const usd = priceGHS !== undefined ? toUSD(priceGHS, 'GHS') : undefined;
  const label = priceGHS !== undefined ? `GH₵ ${Math.round(priceGHS).toLocaleString('en-US')}` : 'Fare not published';
  const priceWord = { seen: 'seen', published: 'published fare', from: 'lowest advertised', unknown: '' }[fare.priceKind];
  return {
    id,
    name,
    category: CATEGORY,
    serviceType: 'digital_remote',
    targetAudience: ['student', 'business', 'supply_chain'],
    location: { city: fare.from, stateOrRegion: '', country: buyer.country, latitude: 0, longitude: 0 },
    pricing: {
      baseMonthlyCost: usd ?? 0,
      pricingModel: 'per_unit',
      currency: 'USD',
      startingTierLabel: fare.priceKind === 'from' ? `from ${label}` : label,
      contractTerm: 'per_item'
    },
    targetIndustries: ['All'],
    targetHeadcount: ['1-10'],
    complianceCertifications: [],
    rating: 0,
    reviewsCount: 0,
    slaGuarantee: fare.sourceName ? `${priceWord ? priceWord[0].toUpperCase() + priceWord.slice(1) : 'Source'}: ${fare.sourceName}` : '',
    summary: [fare.service, fare.note].filter(Boolean).join('. '),
    keyFeatures: tripFeatures(fare),
    websiteUrl: url,
    exactOrderUrl: url || undefined,
    hasOfficialWebsite: !!url,
    dataSource: 'web',
    priceKnown: usd !== undefined,
    priceSource: usd !== undefined ? 'page' : undefined,
    ratingKnown: false,
    locationKnown: false,
    // Fares were looked up for this exact route: they are relevant by construction.
    relevanceHint: 0.9,
    matchBasis: `Fare for ${fare.from} → ${fare.to}`,
    trip: fare
  };
}

export function tripFeatures(f: TripFare): string[] {
  const out: string[] = [];
  if (f.departAt) out.push(`Departs ${f.departAt.slice(0, 16).replace('T', ' ')}`);
  if (f.returnAt) out.push(`Returns ${f.returnAt.slice(0, 10)}`);
  if (f.stops !== undefined) out.push(f.stops === 0 ? 'Non-stop' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`);
  if (f.durationMin) out.push(`${Math.floor(f.durationMin / 60)}h ${f.durationMin % 60}m`);
  if (f.priceKind === 'seen') out.push(`Price seen ${f.checkedOn || 'recently'}: check it before paying`);
  if (f.priceKind === 'published' && f.checkedOn) out.push(`Fare list from ${f.checkedOn}`);
  if (f.passengers > 1) out.push(`Total for ${f.passengers} passengers`);
  return out;
}

/** Bus and domestic flight rows from the published fare lists. */
export function ghanaRows(trip: Trip, buyer: GeoLocation): VendorService[] {
  if (!trip.from.ghana || !trip.to.ghana) return [];
  const rows: VendorService[] = [];
  const from = trip.from.name;
  const to = trip.to.name;
  for (const f of faresFor(from, to, trip.mode)) {
    const fare: TripFare = {
      mode: f.mode, from, to, operator: f.operator, service: f.service,
      priceKind: f.kind === 'from' ? 'from' : 'published',
      checkedOn: f.checkedOn, sourceName: f.sourceName, sourceUrl: f.sourceUrl, note: f.note,
      passengers: trip.passengers
    };
    rows.push(
      baseRow(
        `trip-${f.operator}-${f.service}-${from}-${to}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        `${f.operator} ${f.service}: ${from} → ${to}`,
        fare,
        f.amount * trip.passengers,
        f.bookUrl,
        buyer
      )
    );
  }
  for (const u of unpublishedFor(from, to, trip.mode)) {
    if (rows.some((r) => r.trip?.operator === u.operator)) continue;
    const fare: TripFare = { mode: u.mode, from, to, operator: u.operator, priceKind: 'unknown', note: u.note, passengers: trip.passengers };
    rows.push(baseRow(`trip-${u.operator}-${from}-${to}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), `${u.operator}: ${from} → ${to}`, fare, undefined, u.bookUrl, buyer));
  }
  return rows;
}

export function apiFareToRow(f: ApiFare, trip: Trip, buyer: GeoLocation, index: number): VendorService | undefined {
  const priceGHS = f.currency.toUpperCase() === 'GHS' ? f.price : (() => {
    const usd = toUSD(f.price, f.currency);
    const ghsPerUsd = toUSD(1, 'GHS');
    return usd !== undefined && ghsPerUsd ? usd / ghsPerUsd : undefined;
  })();
  if (priceGHS === undefined) return undefined;
  const airline = f.airlineName || f.airline;
  const fare: TripFare = {
    mode: 'flight', from: trip.from.name, to: trip.to.name, operator: airline,
    service: f.flightNumber ? `Flight ${f.flightNumber}` : undefined,
    departAt: f.departAt, returnAt: f.returnAt, stops: f.stops, durationMin: f.durationMin,
    priceKind: 'seen', checkedOn: f.seenOn, sourceName: 'Fares Aviasales travellers were shown',
    passengers: trip.passengers
  };
  return baseRow(`trip-flight-${index}-${f.airline}-${f.departAt}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), `${airline}: ${trip.from.name} → ${trip.to.name}`, fare, priceGHS, f.link, buyer);
}

/** Every fare Hunu can find for the trip. Flights need Hunu's API; Ghana fares do not. */
export async function searchTravel(trip: Trip, buyer: GeoLocation, signal?: AbortSignal): Promise<TravelResult> {
  const rows = ghanaRows(trip, buyer);
  let calendar: FareCalendarDay[] = [];
  let flightIssue: string | undefined;
  const wantsFlights = trip.mode !== 'bus' && !!trip.from.iata && !!trip.to.iata;
  if (wantsFlights) {
    if (!communityEnabled()) {
      flightIssue = 'this build has no Hunu API address';
    } else {
      type Reply = { fares?: ApiFare[]; calendar?: FareCalendarDay[]; error?: string };
      const res: Reply = await fetch(`${HUNU_API_URL}/travel/flights`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin: trip.from.iata, destination: trip.to.iata, date: trip.date, returnDate: trip.returnDate, passengers: trip.passengers }),
        signal
      })
        .then(async (r) => ((await r.json().catch(() => ({}))) as Reply) || {})
        .catch((err): Reply => ({ error: String((err as Error)?.message || err) }));
      if (res.error) flightIssue = res.error;
      (res.fares || []).forEach((f, i) => {
        const row = apiFareToRow(f, trip, buyer, i);
        if (row) rows.push(row);
      });
      calendar = res.calendar || [];
      if (!res.error && (res.fares || []).length === 0) flightIssue = 'no recent fares for this route and date';
    }
  }
  return { rows, calendar, flightIssue };
}
