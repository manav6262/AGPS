import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ShieldCheck, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email, password });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-[75vh] flex flex-col justify-center py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-brand text-white flex items-center justify-center rounded-sm border border-brand">
            <ShieldCheck className="w-7 h-7" />
          </div>
        </div>
        <h2 className="mt-3 text-center text-xl font-bold text-stone-900">
          Sign In to AGPS Portal
        </h2>
        <p className="mt-1 text-center text-xs text-stone-500">
          Central Public Procurement Portal Authentication Gateway
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="gov-panel">
          {error && (
            <div className="mb-4 p-2.5 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Official Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@gov.in or vendor@domain.com"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-2"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          {/* Quick Demo Logins for Pair Review & Evaluation */}
          <div className="mt-6 pt-4 border-t border-stone-200">
            <div className="text-xs font-medium text-stone-600 mb-2">
              Quick Sign-In (Demo Credentials):
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@agps.gov.in', 'AdminPassword123!')}
                className="btn-secondary text-left px-2 py-1.5 flex flex-col"
              >
                <span className="font-semibold text-stone-800">Admin</span>
                <span className="text-[10px] text-stone-500 font-mono">admin@agps.gov.in</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('auditor@cag.gov.in', 'AuditorPassword123!')}
                className="btn-secondary text-left px-2 py-1.5 flex flex-col"
              >
                <span className="font-semibold text-stone-800">Auditor (CAG)</span>
                <span className="text-[10px] text-stone-500 font-mono">auditor@cag.gov.in</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('vendor1@tatacomm.in', 'VendorPassword123!')}
                className="btn-secondary text-left px-2 py-1.5 flex flex-col col-span-2"
              >
                <span className="font-semibold text-stone-800">Vendor: Tata Advanced Systems</span>
                <span className="text-[10px] text-stone-500 font-mono">vendor1@tatacomm.in</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('vendor2@infosys.in', 'VendorPassword123!')}
                className="btn-secondary text-left px-2 py-1.5 flex flex-col col-span-2"
              >
                <span className="font-semibold text-stone-800">Vendor: Infosys Public Services</span>
                <span className="text-[10px] text-stone-500 font-mono">vendor2@infosys.in</span>
              </button>
            </div>
          </div>

          <div className="mt-4 text-center text-xs text-stone-500">
            New supplier or vendor?{' '}
            <Link to="/register" className="font-medium text-brand hover:underline">
              Register Vendor Entity
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
