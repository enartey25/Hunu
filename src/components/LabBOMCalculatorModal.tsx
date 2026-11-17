import React, { useState } from 'react';
import { SupportedCurrency, formatCurrencyAmount } from '../engine/currency';
import { Plus, Trash2, Cpu, Check, Truck, Copy } from 'lucide-react';
import { Dialog } from './Dialog';

interface BOMItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceUSD: number;
  category: string;
}

interface LabBOMCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: SupportedCurrency;
  destinationCity: string;
}

const DEFAULT_SAMPLE_BOM: BOMItem[] = [
  { id: '1', name: 'ESP32-WROOM-32D Microcontroller Module', quantity: 3, unitPriceUSD: 4.5, category: 'Microcontrollers' },
  { id: '2', name: '0.96 inch I2C OLED Display (128x64)', quantity: 2, unitPriceUSD: 3.2, category: 'Displays' },
  { id: '3', name: '10k Ohm Metal Film Resistors (Pack of 50)', quantity: 1, unitPriceUSD: 2.1, category: 'Passives' },
  { id: '4', name: 'Custom 2-Layer PCB Prototype (5 pcs)', quantity: 1, unitPriceUSD: 2.0, category: 'PCBs' },
  { id: '5', name: 'Solderless Breadboard & Jumper Wire Bundle', quantity: 2, unitPriceUSD: 6.5, category: 'Hardware' }
];

const FREE_SHIPPING_THRESHOLD = 100;
const COURIER_FEE_USD = 28; // DHL Express standard international

export const LabBOMCalculatorModal: React.FC<LabBOMCalculatorModalProps> = ({
  isOpen,
  onClose,
  currency,
  destinationCity
}) => {
  const [items, setItems] = useState<BOMItem[]>(DEFAULT_SAMPLE_BOM);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(5.0);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const newItem: BOMItem = {
      id: `bom-${Date.now()}`,
      name: newItemName.trim(),
      quantity: Number(newItemQty),
      unitPriceUSD: Number(newItemPrice),
      category: 'Components'
    };

    setItems([...items, newItem]);
    setNewItemName('');
    setNewItemQty(1);
    setNewItemPrice(5.0);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const subtotalUSD = items.reduce((acc, item) => acc + item.quantity * item.unitPriceUSD, 0);
  const unlocksFreeShipping = subtotalUSD >= FREE_SHIPPING_THRESHOLD;
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotalUSD);
  const shippingFeeUSD = unlocksFreeShipping ? 0 : COURIER_FEE_USD;
  const totalLandedUSD = subtotalUSD + shippingFeeUSD;
  const showUsd = currency !== 'USD';

  const handleCopyBOM = () => {
    const textLines = [
      `Parts list`,
      `Deliver to: ${destinationCity}`,
      `Made with Hunu`,
      ``,
      ...items.map(
        (it, idx) =>
          `${idx + 1}. ${it.name} | Qty: ${it.quantity} | Unit: $${it.unitPriceUSD.toFixed(2)} | Subtotal: $${(
            it.quantity * it.unitPriceUSD
          ).toFixed(2)}`
      ),
      ``,
      `Parts subtotal: $${subtotalUSD.toFixed(2)} (${formatCurrencyAmount(subtotalUSD, currency)})`,
      `Estimated DHL international shipping: $${shippingFeeUSD.toFixed(2)} (${formatCurrencyAmount(shippingFeeUSD, currency)})`,
      `Estimated total landed cost: $${totalLandedUSD.toFixed(2)} (${formatCurrencyAmount(totalLandedUSD, currency)})`
    ];

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Dialog
      title="Parts list"
      subtitle={`Parts, courier fee and landed cost to ${destinationCity}`}
      icon={<Cpu />}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <button type="button" onClick={handleCopyBOM} disabled={items.length === 0} className="btn mr-auto">
            {copied ? <Check /> : <Copy />}
            <span role="status">{copied ? 'Copied' : 'Copy list'}</span>
          </button>
          <button type="button" onClick={onClose} className="btn btn-ink">
            Done
          </button>
        </>
      }
    >
      <section
        className={`p-3 rounded border-2 border-ink ${unlocksFreeShipping ? 'bg-good-tint' : 'bg-sign-tint'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-start gap-1.5 font-semibold text-sm leading-tight">
            {unlocksFreeShipping ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <Truck className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            {unlocksFreeShipping
              ? `Free DHL Express shipping to ${destinationCity}`
              : `Add ${formatCurrencyAmount(amountToFreeShipping, currency)} more for free shipping`}
          </p>
          <span className="fig text-xs whitespace-nowrap">
            {formatCurrencyAmount(subtotalUSD, currency)} of {formatCurrencyAmount(FREE_SHIPPING_THRESHOLD, currency)}
          </span>
        </div>
        <div
          className="meter mt-2"
          role="progressbar"
          aria-label="Progress to free shipping"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(100, (subtotalUSD / FREE_SHIPPING_THRESHOLD) * 100))}
        >
          <span style={{ width: `${Math.min(100, (subtotalUSD / FREE_SHIPPING_THRESHOLD) * 100)}%` }} />
        </div>
        {!unlocksFreeShipping && (
          <p className="text-xs mt-2">
            Estimate: DigiKey and Mouser orders under ${FREE_SHIPPING_THRESHOLD} usually carry about a $
            {COURIER_FEE_USD} courier fee to Ghana, waived at ${FREE_SHIPPING_THRESHOLD}. Check the fee at
            checkout.
          </p>
        )}
      </section>

      <form onSubmit={handleAddItem} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <label className="col-span-full">
          <span className="label">Part name or number</span>
          <input
            type="text"
            placeholder="e.g. STM32F401 development board"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="field"
            required
          />
        </label>
        <label>
          <span className="label">Quantity</span>
          <input
            type="number"
            min="1"
            value={newItemQty}
            onChange={(e) => setNewItemQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="field"
          />
        </label>
        <label>
          <span className="label">Unit price (USD)</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={newItemPrice}
            onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
            className="field"
          />
        </label>
        <button type="submit" className="btn btn-ink min-h-[34px]!">
          <Plus />
          Add part
        </button>
      </form>

      {items.length === 0 ? (
        <p className="t-mute border-t-2 border-ink pt-3">
          The list is empty. Add a part above to see its landed cost.
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Part</th>
              <th className="num">Qty</th>
              <th className="num">Unit</th>
              <th className="num">Subtotal</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="font-medium">{item.name}</td>
                <td className="num">{item.quantity}</td>
                <td className="num t-mute">{formatCurrencyAmount(item.unitPriceUSD, currency, 2)}</td>
                <td className="num fig">{formatCurrencyAmount(item.quantity * item.unitPriceUSD, currency, 2)}</td>
                <td className="p-1!">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="icon-btn"
                    aria-label={`Remove ${item.name}`}
                    title="Remove this part"
                  >
                    <Trash2 />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dl className="answer grid-cols-3">
        <div>
          <dt>Parts</dt>
          <dd className="fig">{formatCurrencyAmount(subtotalUSD, currency, 2)}</dd>
          {showUsd && <dd>${subtotalUSD.toFixed(2)} USD</dd>}
        </div>
        <div>
          <dt>DHL to {destinationCity}</dt>
          <dd className="fig">
            {unlocksFreeShipping ? 'Free' : formatCurrencyAmount(shippingFeeUSD, currency, 2)}
          </dd>
          <dd>{unlocksFreeShipping ? `Waived over $${FREE_SHIPPING_THRESHOLD}` : 'Standard air express'}</dd>
        </div>
        <div className="is-key">
          <dt>Total landed cost</dt>
          <dd className="fig">{formatCurrencyAmount(totalLandedUSD, currency, 2)}</dd>
          {showUsd && <dd>${totalLandedUSD.toFixed(2)} USD</dd>}
        </div>
      </dl>
    </Dialog>
  );
};
