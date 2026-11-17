import React, { useState } from 'react';
import { CompanyProfile, HeadcountRange, BudgetTier, UserRole } from '../engine/types';
import { detectUserLocation } from '../engine/geolocation';
import { Building2, MapPin, Check, LocateFixed, Loader2, GraduationCap } from 'lucide-react';
import { Dialog } from './Dialog';

interface CompanyProfileModalProps {
  profile: CompanyProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: CompanyProfile) => void;
}

const BUSINESS_INDUSTRIES = [
  'SaaS / Software',
  'Hardware & Engineering',
  'Academic Research & Labs',
  'Logistics & Supply Chain',
  'Fintech / Banking',
  'Healthcare & Life Sciences',
  'Manufacturing & Industrial',
  'E-commerce & Retail',
  'Professional / Legal Services'
];

const STUDENT_MAJORS = [
  'Electrical & Computer Engineering',
  'Computer Science & Software',
  'Mechanical & Robotics Engineering',
  'Biomedical & Natural Sciences',
  'Business Administration & Economics',
  'Physical Sciences & Chemistry',
  'Other / General Studies'
];

const HEADCOUNT_OPTIONS: HeadcountRange[] = ['1-10', '11-50', '51-200', '201-1000', '1000+'];
const BUDGET_TIERS: BudgetTier[] = ['Bootstrap', 'Growth', 'Mid-Market', 'Enterprise'];

const WEIGHTS: { key: keyof CompanyProfile['priorityWeights']; label: string }[] = [
  { key: 'priceWeight', label: 'Price and discounts' },
  { key: 'locationWeight', label: 'Distance and local pickup' }
];

export const CompanyProfileModal: React.FC<CompanyProfileModalProps> = ({
  profile,
  isOpen,
  onClose,
  onSave
}) => {
  const [form, setForm] = useState<CompanyProfile>(profile);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAutoDetectLocation = async () => {
    setIsDetecting(true);
    try {
      const loc = await detectUserLocation();
      setForm((prev) => ({
        ...prev,
        location: {
          ...prev.location,
          city: loc.city,
          stateOrRegion: loc.stateOrRegion,
          country: loc.country,
          latitude: loc.latitude,
          longitude: loc.longitude,
          organization: loc.organization
        },
        studentProfile: prev.studentProfile
          ? {
              ...prev.studentProfile,
              institution: loc.organization || prev.studentProfile.institution
            }
          : undefined
      }));

      setDetectedNote(
        `Found you in ${loc.city}, ${loc.country}${loc.organization ? ` (${loc.organization})` : ''}`
      );
    } finally {
      setIsDetecting(false);
    }
  };

  const handleRoleToggle = (role: UserRole) => {
    setForm((prev) => ({
      ...prev,
      userRole: role,
      priorityWeights:
        role === 'student'
          ? { priceWeight: 0.5, locationWeight: 0.25, fitWeight: 0.15, qualityWeight: 0.1 }
          : { priceWeight: 0.35, locationWeight: 0.25, fitWeight: 0.25, qualityWeight: 0.15 }
    }));
  };

  const handleWeightChange = (key: keyof CompanyProfile['priorityWeights'], val: number) => {
    setForm((prev) => ({
      ...prev,
      priorityWeights: {
        ...prev.priorityWeights,
        [key]: val
      }
    }));
  };

  const setLocation = (patch: Partial<CompanyProfile['location']>) =>
    setForm((prev) => ({ ...prev, location: { ...prev.location, ...patch } }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  const isStudent = form.userRole === 'student';

  return (
    <Dialog
      title={isStudent ? 'Your student profile' : 'Your business profile'}
      icon={isStudent ? <GraduationCap /> : <Building2 />}
      onClose={onClose}
      onSubmit={handleSubmit}
      width="max-w-xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn">
            Cancel
          </button>
          <button type="submit" className="btn btn-ink">
            <Check />
            Save and re-rank
          </button>
        </>
      }
    >
      <div>
        <span className="label" id="hunu-role-label">
          I am shopping as
        </span>
        <div className="seg" role="group" aria-labelledby="hunu-role-label">
          <button type="button" aria-pressed={isStudent} onClick={() => handleRoleToggle('student')}>
            <GraduationCap />
            A student
          </button>
          <button type="button" aria-pressed={!isStudent} onClick={() => handleRoleToggle('business')}>
            <Building2 />
            A business
          </button>
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="group-title flex items-center gap-1.5">
            <MapPin className="w-4 h-4" />
            Where you are
          </h3>
          <button type="button" onClick={handleAutoDetectLocation} disabled={isDetecting} className="btn">
            {isDetecting ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            {isDetecting ? 'Detecting' : 'Detect my location'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label>
            <span className="label">City</span>
            <input
              type="text"
              value={form.location.city}
              onChange={(e) => setLocation({ city: e.target.value })}
              className="field"
            />
          </label>
          <label>
            <span className="label">Region</span>
            <input
              type="text"
              value={form.location.stateOrRegion}
              onChange={(e) => setLocation({ stateOrRegion: e.target.value })}
              className="field"
            />
          </label>
          <label>
            <span className="label">Country</span>
            <input
              type="text"
              value={form.location.country}
              onChange={(e) => setLocation({ country: e.target.value })}
              className="field"
            />
          </label>
        </div>

        <p className="t-mute text-xs mt-1.5" role="status">
          {detectedNote ? (
            <span className="note-good">{detectedNote}</span>
          ) : (
            'Distance and shipping are worked out from here.'
          )}
        </p>
      </section>

      {isStudent ? (
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">University or campus</span>
            <input
              type="text"
              value={form.studentProfile?.institution ?? 'University of Ghana'}
              onChange={(e) =>
                setForm({
                  ...form,
                  companyName: e.target.value,
                  studentProfile: {
                    institution: e.target.value,
                    majorOrDepartment:
                      form.studentProfile?.majorOrDepartment || 'Computer Science & Engineering',
                    academicLevel: form.studentProfile?.academicLevel || 'Undergraduate',
                    hasEduEmail: true
                  }
                })
              }
              className="field"
            />
          </label>
          <label>
            <span className="label">Field of study</span>
            <select
              value={form.studentProfile?.majorOrDepartment || 'Electrical & Computer Engineering'}
              onChange={(e) =>
                setForm({
                  ...form,
                  studentProfile: {
                    institution: form.studentProfile?.institution || 'University of Ghana',
                    academicLevel: form.studentProfile?.academicLevel || 'Undergraduate',
                    hasEduEmail: form.studentProfile?.hasEduEmail ?? true,
                    majorOrDepartment: e.target.value
                  }
                })
              }
              className="field"
            >
              {STUDENT_MAJORS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">Company or organisation</span>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="field"
            />
          </label>
          <label>
            <span className="label">Industry</span>
            <select
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="field"
            >
              {BUSINESS_INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Team size</span>
            <select
              value={form.headcount}
              onChange={(e) => setForm({ ...form, headcount: e.target.value as HeadcountRange })}
              className="field"
            >
              {HEADCOUNT_OPTIONS.map((hc) => (
                <option key={hc} value={hc}>
                  {hc} people
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Budget</span>
            <select
              value={form.budgetTier}
              onChange={(e) => setForm({ ...form, budgetTier: e.target.value as BudgetTier })}
              className="field"
            >
              {BUDGET_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <section>
        <h3 className="group-title">What matters most</h3>
        <p className="t-mute text-xs mt-0.5 mb-2">
          Move a slider and the deals are ranked again when you save.
        </p>
        <div className="space-y-2.5">
          {WEIGHTS.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="flex items-baseline justify-between">
                <span className="label mb-0!">{label}</span>
                <span className="fig">{Math.round(form.priorityWeights[key] * 100)}%</span>
              </span>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={form.priorityWeights[key]}
                onChange={(e) => handleWeightChange(key, parseFloat(e.target.value))}
                className="range"
              />
            </label>
          ))}
        </div>
      </section>
    </Dialog>
  );
};
