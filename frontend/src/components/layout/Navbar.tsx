import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { LayoutDashboard, FileText, Send, UserCheck, ShieldAlert, PlusCircle, Users } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return (
      <nav className="bg-white border-b border-stone-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 h-10 items-center">
            <NavLink
              to="/tenders"
              className={({ isActive }) =>
                `inline-flex items-center px-3 py-1.5 text-xs font-medium border-b-2 ${
                  isActive
                    ? 'border-brand text-brand font-semibold'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
                }`
              }
            >
              Public Tenders
            </NavLink>
          </div>
        </div>
      </nav>
    );
  }

  const role = user.role;
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isOfficer = role === 'PROCUREMENT_OFFICER';

  return (
    <nav className="bg-white border-b border-stone-300 shadow-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 h-10 items-center overflow-x-auto">
          <NavLink
            to={isOfficer ? '/officer/dashboard' : '/dashboard'}
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-brand text-brand font-semibold bg-stone-50'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
              }`
            }
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/tenders"
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-brand text-brand font-semibold bg-stone-50'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
              }`
            }
          >
            <FileText className="w-3.5 h-3.5" />
            <span>
              {role === 'VENDOR'
                ? 'Available Tenders'
                : isOfficer
                ? 'My Department Tenders'
                : 'Tender Registry'}
            </span>
          </NavLink>

          {(isAdmin || isOfficer) && (
            <NavLink
              to="/tenders/new"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-brand text-brand font-semibold bg-stone-50'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
                }`
              }
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Tender</span>
            </NavLink>
          )}

          {isAdmin && (
            <NavLink
              to="/admin/officers"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-brand text-brand font-semibold bg-stone-50'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
                }`
              }
            >
              <Users className="w-3.5 h-3.5" />
              <span>Government Officers</span>
            </NavLink>
          )}

          {role === 'VENDOR' && (
            <>
              <NavLink
                to="/vendor/bids"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-brand text-brand font-semibold bg-stone-50'
                      : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
                  }`
                }
              >
                <Send className="w-3.5 h-3.5" />
                <span>My Submitted Bids</span>
              </NavLink>

              <NavLink
                to="/vendor/profile"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-brand text-brand font-semibold bg-stone-50'
                      : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
                  }`
                }
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Company Profile</span>
              </NavLink>
            </>
          )}

          {(isAdmin || role === 'AUDITOR') && (
            <NavLink
              to="/audit"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-brand text-brand font-semibold bg-stone-50'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
                }`
              }
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Audit Trail & Cryptographic Verification</span>
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
};

