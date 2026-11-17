import React, { useState } from 'react';
import { GeoLocation, ServiceCategory, VendorService } from '../engine/types';
import { shopPinToVendor } from '../engine/shopPins';
import { reverseArea } from '../engine/geolocation';
import { communityEnabled, shareShop } from '../engine/communityPrices';
import { MapPinPlus } from 'lucide-react';
import { Dialog } from './Dialog';
import { PinPicker, PinPoint } from './map/PinPicker';

interface PinShopModalProps {
  onClose: () => void;
  onSave: (shop: VendorService) => void;
  /** The buyer's own location: where the map opens. */
  home: GeoLocation;
  /** What the buyer is searching for, offered as what the shop sells. */
  defaultSells?: string;
  category?: ServiceCategory;
}

/** Puts a shop on the map that no map lists: a stall, a kiosk, a shop with no website. */
export const PinShopModal: React.FC<PinShopModalProps> = ({ onClose, onSave, home, defaultSells = '', category }) => {
  const [point, setPoint] = useState<PinPoint | undefined>();
  const [name, setName] = useState('');
  const [sells, setSells] = useState(defaultSells);
  const [area, setArea] = useState('');
  const [areaFromMap, setAreaFromMap] = useState(false);
  const [phone, setPhone] = useState('');
  const [share, setShare] = useState(false);
  const [error, setError] = useState('');
  const canShare = communityEnabled();

  const handlePoint = (p: PinPoint) => {
    setPoint(p);
    setError('');
    // Name the area from the map, unless the buyer typed one.
    if (!area.trim() || areaFromMap) {
      void reverseArea(p.latitude, p.longitude).then((found) => {
        if (found) {
          setArea(found);
          setAreaFromMap(true);
        }
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!point) {
      setError('Tap the map where the shop is.');
      return;
    }
    const shop = shopPinToVendor({
      name,
      sells,
      area,
      phone,
      latitude: point.latitude,
      longitude: point.longitude,
      buyer: home,
      category
    });
    if (!shop) {
      setError('Name the shop.');
      return;
    }
    if (canShare && share && !sells.trim()) {
      setError('Say what the shop sells, so other buyers can find it.');
      return;
    }
    onSave(shop);
    // Sent in the background; a failed share never loses the pin.
    if (canShare && share) void shareShop(shop, sells).catch(() => undefined);
    onClose();
  };

  return (
    <Dialog
      title="Pin a shop"
      subtitle="For a shop no map lists: a stall, a kiosk, a shop with no website"
      icon={<MapPinPlus />}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn">
            Cancel
          </button>
          <button type="submit" className="btn btn-ink">
            <MapPinPlus />
            Pin this shop
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <div className="col-span-full">
          <span className="label">Where it is</span>
          <PinPicker center={home} value={point} onChange={handlePoint} label="Map: tap where the shop is" />
        </div>

        <label className="col-span-full">
          <span className="label">Shop name</span>
          <input
            type="text"
            required
            placeholder="e.g. Auntie Ama's Phones"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
          />
        </label>

        <label className="col-span-full">
          <span className="label">What they sell</span>
          <input
            type="text"
            placeholder="e.g. laptops, phone repairs, chargers"
            value={sells}
            onChange={(e) => setSells(e.target.value)}
            className="field"
          />
          <span className="t-mute text-xs block mt-1">Searches for these words will show the shop.</span>
        </label>

        <label>
          <span className="label">Area (optional)</span>
          <input
            type="text"
            placeholder="e.g. Makola"
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

        {canShare && (
          <label className="col-span-full flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5" />
            <span>
              Share this shop with other Hunu users
              <span className="t-mute text-xs block">
                Only its name, what it sells, the area and the pin go out. Not you, and not their phone.
              </span>
            </span>
          </label>
        )}

        {error && (
          <p className="col-span-full text-[13px]" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
};
