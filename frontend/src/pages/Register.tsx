import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { Building2, AlertCircle } from 'lucide-react';

export const Register: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    companyName: '',
    registrationNo: '',
    gstin: '',
    address: '',
    contactPhone: '',
    experienceYears: 5,
    annualTurnoverMinor: 1000000000,
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await register(formData);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please verify submitted details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-6">
        <div className="inline-flex p-2 bg-stone-200 text-brand rounded-sm mb-2">
          <Building2 className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-stone-900">Vendor / Supplier Registration</h1>
        <p className="text-xs text-stone-500">
          Register corporate profile to participate in Government Procurement Tenders
        </p>
      </div>

      <div className="gov-panel">
        {error && (
          <div className="mb-4 p-2.5 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Authorized Signatory Name *
              </label>
              <input
                type="text"
                required
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Full Name"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Official Email Address *
              </label>
              <input
                type="email"
                required
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="vendor@company.com"
                className="w-full"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Account Password *
              </label>
              <input
                type="password"
                required
                minLength={8}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Min 8 characters"
                className="w-full"
              />
            </div>

            <div className="sm:col-span-2 border-t border-stone-200 pt-4">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-3">
                Corporate Entity Details
              </h3>
            </div>

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
                placeholder="Enterprise Pvt Ltd"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Company Registration No (CIN / ROC) *
              </label>
              <input
                type="text"
                required
                name="registrationNo"
                value={formData.registrationNo}
                onChange={handleChange}
                placeholder="REG-123456"
                className="w-full font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                GSTIN Number (15 Digits) *
              </label>
              <input
                type="text"
                required
                name="gstin"
                value={formData.gstin}
                onChange={handleChange}
                placeholder="07AAAAA0000A1Z5"
                className="w-full font-mono text-xs uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Relevant Experience (Years) *
              </label>
              <input
                type="number"
                required
                min={0}
                max={100}
                name="experienceYears"
                value={formData.experienceYears}
                onChange={handleChange}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Annual Turnover (Paise / Minor Units) *
              </label>
              <input
                type="number"
                required
                min={0}
                name="annualTurnoverMinor"
                value={formData.annualTurnoverMinor}
                onChange={handleChange}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Contact Telephone *
              </label>
              <input
                type="tel"
                required
                name="contactPhone"
                value={formData.contactPhone}
                onChange={handleChange}
                placeholder="011-23456789"
                className="w-full"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Registered Office Address *
              </label>
              <textarea
                required
                rows={2}
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Full official address"
                className="w-full"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-stone-200 flex items-center justify-between">
            <Link to="/login" className="text-xs text-stone-600 hover:text-stone-900">
              Back to Sign In
            </Link>
            <button type="submit" disabled={loading} className="btn-primary px-5 py-2">
              {loading ? 'Submitting Registration...' : 'Complete Registration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
