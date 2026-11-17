import React from 'react';
import { TrustAssessment, TrustGroup, TRUST_LABEL } from '../engine/trust';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Shield, Star } from 'lucide-react';

const ICON = {
  trusted: ShieldCheck,
  ok: Shield,
  caution: ShieldAlert,
  risky: ShieldAlert,
  unknown: ShieldQuestion
} as const;

/** "Trust 82 · Trusted", coloured by level. A warning is never shown smaller than praise. */
export const TrustBadge: React.FC<{ trust?: TrustAssessment; className?: string }> = ({ trust, className = '' }) => {
  if (!trust) return null;
  const Icon = ICON[trust.level];
  const text = trust.score === undefined ? TRUST_LABEL[trust.level] : `Trust ${trust.score} · ${TRUST_LABEL[trust.level]}`;
  return (
    <span className={`trust trust-${trust.level} ${className}`} title={trust.advice}>
      <Icon aria-hidden="true" />
      {text}
    </span>
  );
};

const GROUP_LABEL: Record<TrustGroup, string> = {
  product: 'Product',
  seller: 'Seller',
  store: 'Store',
  'hunu users': 'Hunu buyers',
  checks: 'Hunu checks'
};
const ORDER: TrustGroup[] = ['product', 'seller', 'store', 'hunu users', 'checks'];

/** The evidence behind the score, grouped, with what to do about it. */
export const TrustDetails: React.FC<{ trust?: TrustAssessment; onRateSeller?: () => void }> = ({ trust, onRateSeller }) => {
  if (!trust) return null;
  const groups = ORDER.map((g) => ({ g, signals: trust.signals.filter((s) => s.group === g) })).filter((x) => x.signals.length > 0);
  return (
    <section className="border-t b-rule pt-3" aria-label="Trust">
      <div className="flex items-center gap-2 flex-wrap">
        <TrustBadge trust={trust} />
        <span className="font-semibold">{trust.advice}</span>
      </div>
      {groups.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-2 gap-y-1">
          {groups.map(({ g, signals }) => (
            <React.Fragment key={g}>
              <dt className="t-mute text-xs pt-0.5">{GROUP_LABEL[g]}</dt>
              <dd>
                <ul>
                  {signals.map((s, i) => (
                    <li key={i} className={`trust-signal is-${s.effect}`}>
                      {s.label}
                      {s.sourceUrl && (
                        <>
                          {' '}
                          <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="lnk text-xs">
                            Source
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : (
        <p className="t-mute text-xs mt-1">No ratings, reviews or store policy found for this offer.</p>
      )}
      {onRateSeller && (
        <button type="button" onClick={onRateSeller} className="btn mt-2">
          <Star />
          I bought here: rate this seller
        </button>
      )}
    </section>
  );
};
