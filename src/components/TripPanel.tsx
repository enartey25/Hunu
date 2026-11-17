import React, { useEffect, useState } from 'react';
import { Bell, BellRing, Plane, Bus, TriangleAlert, X } from 'lucide-react';
import { Trip, routeLabel } from '../engine/tripParser';
import { FareCalendarDay } from '../engine/travelSearch';
import { FareWatch, canWatch, hasDropped, listWatches, stopWatching, watchQuery, watchTrip } from '../engine/fareWatch';
import { SupportedCurrency, formatCurrencyAmount, toUSD } from '../engine/currency';
import { VendorService } from '../engine/types';

const ghs = (amount: number, currency: SupportedCurrency) => formatCurrencyAmount(toUSD(amount, 'GHS') ?? 0, currency);

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Above a trip's fares: the route and date, the cheapest fare on the days around it,
 * and watching the route for a lower fare.
 */
export const TripPanel: React.FC<{
  trip: Trip;
  calendar: FareCalendarDay[];
  fares: VendorService[];
  currency: SupportedCurrency;
  /** Why flight fares are missing, when they are. */
  issue?: string;
  onSearch: (query: string) => void;
}> = ({ trip, calendar, fares, currency, issue, onSearch }) => {
  const [watchState, setWatchState] = useState<'idle' | 'saving' | 'watching' | string>('idle');
  const cheapestFlightGHS = fares
    .filter((v) => v.trip?.mode === 'flight' && v.trip.priceKind === 'seen' && v.pricing.baseMonthlyCost > 0)
    .map((v) => v.pricing.baseMonthlyCost / (toUSD(1, 'GHS') || 1))
    .sort((a, b) => a - b)[0];

  useEffect(() => setWatchState('idle'), [trip.from.name, trip.to.name, trip.date]);

  const when = trip.date ? (trip.date.length === 7 ? new Date(`${trip.date}-15`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : dayLabel(trip.date)) : 'any date';
  const Icon = trip.mode === 'bus' ? Bus : Plane;

  const watch = async () => {
    setWatchState('saving');
    const error = await watchTrip(trip, cheapestFlightGHS);
    setWatchState(error || 'watching');
  };

  return (
    <section className="band p-3.5 space-y-2.5" aria-label="Trip">
      <div className="flex items-start gap-2.5">
        <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-[17px] leading-tight">{routeLabel(trip)}</h2>
          <p className="t-mute text-[13px]">
            {when}
            {trip.returnDate ? `, back ${dayLabel(trip.returnDate)}` : ', one way'}
            {trip.passengers > 1 ? ` · ${trip.passengers} passengers` : ''}
            {trip.fromAssumed ? ` · from ${trip.from.name}, where you are` : ''}
          </p>
        </div>
        {canWatch(trip) && (
          <button
            type="button"
            className="btn shrink-0"
            onClick={watch}
            disabled={watchState === 'saving' || watchState === 'watching'}
            aria-live="polite"
          >
            {watchState === 'watching' ? <BellRing /> : <Bell />}
            {watchState === 'watching' ? 'Watching' : watchState === 'saving' ? 'Saving' : 'Watch this route'}
          </button>
        )}
      </div>

      {typeof watchState === 'string' && !['idle', 'saving', 'watching'].includes(watchState) && (
        <p className="text-[13px]" role="alert">Could not watch it: {watchState}</p>
      )}
      {watchState === 'watching' && (
        <p className="t-mute text-[13px]">Hunu checks this route every morning and tells you here when the fare falls.</p>
      )}

      {calendar.length > 1 && (
        <div>
          <p className="t-mute text-xs mb-1">Cheapest fare seen, by day</p>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(78px,1fr))] gap-1.5">
            {calendar.map((d) => {
              const lowest = Math.min(...calendar.map((x) => x.price));
              const current = d.date === trip.date;
              return (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => onSearch(`${trip.from.name} to ${trip.to.name} ${d.date}${trip.passengers > 1 ? ` ${trip.passengers} adults` : ''}`)}
                    className={`w-full text-left rounded border px-2 py-1 ${current ? 'border-ink' : 'b-rule'}`}
                    aria-current={current ? 'date' : undefined}
                  >
                    <span className="block text-xs t-mute">{dayLabel(d.date)}</span>
                    <span className={`fig block text-[13px] ${d.price === lowest ? 'font-semibold text-good' : ''}`}>{ghs(d.price, currency)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {issue && (
        <p className="flex items-start gap-2 text-[13px]">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>No flight fares: {issue}.</span>
        </p>
      )}
      <p className="t-mute text-xs">
        Flight prices are what travellers were shown in the last few days and can change; bus fares are the companies' published lists. Check
        the price before you pay.
      </p>
    </section>
  );
};

/** The routes this device watches, with any fall since the last check. */
export const WatchedTrips: React.FC<{ currency: SupportedCurrency; onSearch: (query: string) => void; refreshKey?: unknown }> = ({ currency, onSearch, refreshKey }) => {
  const [watches, setWatches] = useState<FareWatch[]>([]);
  useEffect(() => {
    let live = true;
    listWatches().then((w) => live && setWatches(w));
    return () => {
      live = false;
    };
  }, [refreshKey]);
  if (watches.length === 0) return null;

  return (
    <section className="band p-3.5" aria-label="Watched trips">
      <h2 className="font-semibold text-[15px] mb-1.5">Routes you are watching</h2>
      <ul className="space-y-1">
        {watches.map((w) => (
          <li key={w.id} className="flex items-center gap-2 text-[14px]">
            <button type="button" className="text-left flex-1 min-w-0 underline-offset-2 hover:underline" onClick={() => onSearch(watchQuery(w))}>
              <span className="font-semibold">{w.label || `${w.origin} → ${w.destination}`}</span>
              <span className="t-mute">{w.date ? ` · ${w.date}` : ''}</span>
            </button>
            {w.lastPrice !== null && (
              <span className={`fig whitespace-nowrap ${hasDropped(w) ? 'text-good font-semibold' : ''}`}>
                {hasDropped(w) && w.previousPrice !== null ? `↓ ${ghs(w.lastPrice, currency)} (was ${ghs(w.previousPrice, currency)})` : ghs(w.lastPrice, currency)}
              </span>
            )}
            <button
              type="button"
              className="p-1"
              aria-label={`Stop watching ${w.label || w.origin + ' to ' + w.destination}`}
              onClick={async () => {
                if (await stopWatching(w.id)) setWatches((prev) => prev.filter((x) => x.id !== w.id));
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
