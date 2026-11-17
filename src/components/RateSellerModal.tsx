import React, { useState } from 'react';
import { VendorService } from '../engine/types';
import { rateSeller } from '../engine/communityPrices';
import { sellerKey } from '../engine/trust';
import { Star } from 'lucide-react';
import { Dialog } from './Dialog';

interface RateSellerModalProps {
  vendor: VendorService;
  onClose: () => void;
  /** Called with the seller's key and the stars once the rating is saved. */
  onRated: (key: string, stars: number) => void;
}

const WORDS = ['', 'Avoid', 'Poor', 'Okay', 'Good', 'Excellent'];

/** "I bought here": stars and a short note, shared anonymously with other Hunu buyers. */
export const RateSellerModal: React.FC<RateSellerModalProps> = ({ vendor, onClose, onRated }) => {
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = sellerKey(vendor);
  const sellerName = vendor.seller?.name || vendor.name.replace(/\s*\([^)]*\)\s*$/, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key) return;
    if (stars < 1) {
      setError('Pick 1 to 5 stars.');
      return;
    }
    setBusy(true);
    const result = await rateSeller(key, stars, note);
    setBusy(false);
    if (result === 'saved') {
      onRated(key, stars);
      onClose();
    } else {
      setError(result === 'refused' ? 'Not saved: that is a lot of ratings for one day.' : 'Could not reach Hunu. Try again later.');
    }
  };

  return (
    <Dialog
      title="Rate this seller"
      subtitle={sellerName}
      icon={<Star />}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn">
            Cancel
          </button>
          <button type="submit" className="btn btn-ink" disabled={busy || !key}>
            <Star />
            {busy ? 'Saving' : 'Share my rating'}
          </button>
        </>
      }
    >
      <fieldset>
        <legend className="label">How did buying from them go?</legend>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} ${n === 1 ? 'star' : 'stars'}: ${WORDS[n]}`}
              onClick={() => {
                setStars(n);
                setError('');
              }}
              className={`btn btn-icon ${stars >= n ? 'is-on' : ''}`}
            >
              <Star />
            </button>
          ))}
          <span className="ml-2 text-[13px] font-semibold" aria-live="polite">
            {WORDS[stars]}
          </span>
        </div>
      </fieldset>

      <label className="block mt-3">
        <span className="label">What should other buyers know? (optional)</span>
        <textarea
          rows={3}
          maxLength={200}
          placeholder="e.g. Item was as described, delivered the next day"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="field"
        />
        <span className="t-mute text-xs block mt-1">{200 - note.length} characters left. Phone numbers are removed.</span>
      </label>

      {error && (
        <p className="text-[13px] mt-2" role="alert">
          {error}
        </p>
      )}

      <p className="t-mute text-xs mt-3">
        Shared anonymously with other Hunu buyers and used in this seller’s Trust score. Rating them again changes your
        rating. Buyers can report a rating that looks wrong.
      </p>
    </Dialog>
  );
};
