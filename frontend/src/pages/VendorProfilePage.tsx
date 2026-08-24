import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { VendorProfile } from '../types/index.js';
import { ProvenanceBadge } from '../components/common/ProvenanceBadge.js';
import { useAuth } from '../context/AuthContext.js';
import { Building2, Save, CheckCircle2, AlertCircle } from 'lucide-react';

export const VendorProfilePage: React.FC = () => {
  const { refreshProfile } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    companyName: '',
    contactPhone: '',
    address: '',
    experienceYears: 0,
    annualTurnoverMinor: 0,
  });

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await api.vendors.getMyProfile();
        setProfile(res.profile);
        setFormData({
          companyName: res.profile.companyName || '',
          contactPhone: res.profile.contactPhone || '',
          address: res.profile.address || '',
          experienceYears: res.profile.experienceYears || 0,
          annualTurnoverMinor: res.profile.annualTurnoverMinor || 0,
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load vendor profile');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    try {
      const res = await api.vendors.updateMyProfile(formData);
      setProfile(res.profile);
      setSuccess('Corporate profile successfully updated!');
      await refreshProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-stone-500">Loading company profile...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand" />
            <span>Supplier / Vendor Profile</span>
          </h1>
          <p className="text-xs text-stone-500">
            Registered corporate details referenced during tender eligibility and SAW scoring
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500">Data Provenance:</span>
          <ProvenanceBadge status="SELF_REPORTED" source="PORTAL" />
        </div>
      </div>

      {success && (
        <div className="p-3 bg-status-passedBg border border-status-passedBorder rounded-sm text-status-passedText text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="gov-panel">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Readonly Identity Tokens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-3 rounded-sm border border-stone-200">
            <div>
              <span className="text-[11px] text-stone-500 uppercase tracking-wider block font-medium">
                Company Registration No
              </span>
              <span className="font-mono text-xs font-bold text-stone-900">
                {profile?.registrationNo || 'N/A'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-stone-500 uppercase tracking-wider block font-medium">
                GSTIN Identification
              </span>
              <span className="font-mono text-xs font-bold text-stone-900">
                {profile?.gstin || 'N/A'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Company Legal Name *
              </label>
              <input
                type="text"
                required
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                className="w-full text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Experience in Domain (Years) *
              </label>
              <input
                type="number"
                required
                min={0}
                max={100}
                name="experienceYears"
                value={formData.experienceYears}
                onChange={handleChange}
                className="w-full text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Annual Turnover (Paise) *
              </label>
              <input
                type="number"
                required
                min={0}
                name="annualTurnoverMinor"
                value={formData.annualTurnoverMinor}
                onChange={handleChange}
                className="w-full text-xs font-mono"
              />
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                ₹{(formData.annualTurnoverMinor / 100).toLocaleString('en-IN')} INR
              </span>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Official Contact Phone *
              </label>
              <input
                type="tel"
                required
                name="contactPhone"
                value={formData.contactPhone}
                onChange={handleChange}
                className="w-full text-xs font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Registered Corporate Address *
              </label>
              <textarea
                required
                rows={2}
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full text-xs"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-stone-200 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center gap-1.5 px-4 py-2"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving Profile...' : 'Update Corporate Profile'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
