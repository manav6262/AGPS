import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { RoleBadge } from '../common/RoleBadge.js';
import { ShieldCheck, LogOut, User as UserIcon } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, vendorProfile, logout, isAuthenticated } = useAuth();

  return (
    <header className="bg-brand text-white border-b-2 border-brand-hover">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo & Portal Title */}
          <Link to="/" className="flex items-center space-x-3 text-white hover:opacity-95">
            <div className="w-8 h-8 rounded-sm bg-white text-brand flex items-center justify-center font-bold text-base border border-stone-300 shadow-none">
              <ShieldCheck className="w-5 h-5 text-brand" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight leading-none flex items-center gap-2">
                <span>AGPS</span>
                <span className="text-xs font-normal text-stone-200 border-l border-brand-hover pl-2">
                  GOVERNMENT OF INDIA
                </span>
              </div>
              <p className="text-[11px] text-stone-300 leading-tight">
                Automated Government Procurement System & Evaluation Engine
              </p>
            </div>
          </Link>

          {/* User Session Bar */}
          {isAuthenticated && user && (
            <div className="flex items-center space-x-4 text-xs">
              <div className="text-right hidden sm:block">
                <div className="font-medium text-white flex items-center justify-end gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-stone-300" />
                  <span>{user.name}</span>
                </div>
                <div className="text-[11px] text-stone-300 flex items-center justify-end gap-1.5">
                  {user.role === 'VENDOR' && vendorProfile && (
                    <span className="font-mono">{vendorProfile.companyName} | </span>
                  )}
                  <span>{user.email}</span>
                </div>
              </div>

              <RoleBadge role={user.role} />

              <button
                onClick={logout}
                className="inline-flex items-center space-x-1 bg-brand-hover hover:bg-brand-dark text-stone-200 hover:text-white px-2.5 py-1 rounded-sm border border-brand-dark transition-colors"
                title="Sign out of AGPS session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          )}

          {!isAuthenticated && (
            <div className="flex items-center space-x-2">
              <Link
                to="/login"
                className="bg-white text-brand hover:bg-stone-100 font-medium px-3 py-1 rounded-sm text-xs transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="bg-brand-hover hover:bg-brand-dark text-white font-medium px-3 py-1 rounded-sm text-xs border border-brand-dark transition-colors"
              >
                Vendor Registration
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
