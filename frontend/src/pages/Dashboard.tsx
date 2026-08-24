import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';
import { ITender } from '@agps/shared';
import { StatusBadge } from '../components/common/StatusBadge.js';
import { FileText, ShieldCheck, PlusCircle, CheckCircle2, ArrowRight } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user, vendorProfile } = useAuth();
  const [tenders, setTenders] = useState<ITender[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [tendersRes, summaryRes] = await Promise.all([
          api.tenders.list(),
          api.dashboard.getSummary().catch(() => null),
        ]);
        setTenders(tendersRes.tenders || []);
        if (summaryRes?.summary) {
          setSummary(summaryRes.summary);
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const publishedCount = summary ? summary.activeTenders : tenders.filter((t) => t.status === 'PUBLISHED' || t.status === 'BIDDING_OPEN').length;
  const evaluatedCount = summary ? summary.evaluatedTenders : tenders.filter((t) => t.status === 'EVALUATED' || t.status === 'WINNER_SELECTED').length;
  const closedCount = summary ? summary.closedTenders : tenders.filter((t) => t.status === 'CLOSED').length;
  const totalBidsCount = summary ? summary.totalBids : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-stone-300 rounded p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-stone-900">
            Welcome, {user?.name}
          </h1>
          <p className="text-xs text-stone-500">
            Role: <span className="font-semibold text-stone-700">{user?.role}</span>
            {user?.role === 'VENDOR' && vendorProfile && (
              <span> • Entity: <strong className="text-stone-800">{vendorProfile.companyName}</strong> (GSTIN: {vendorProfile.gstin})</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user?.role === 'ADMIN' && (
            <Link to="/tenders/new" className="btn-primary flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4" />
              <span>Create Tender</span>
            </Link>
          )}
          <Link to="/tenders" className="btn-secondary flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            <span>View All Tenders</span>
          </Link>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="gov-panel p-3">
          <span className="text-[11px] text-stone-500 uppercase tracking-wider font-medium">
            Active / Bidding Open
          </span>
          <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
            {publishedCount}
          </div>
          <span className="text-[11px] text-status-passedText flex items-center gap-1 mt-1">
            <CheckCircle2 className="w-3 h-3" /> Live Submissions
          </span>
        </div>

        <div className="gov-panel p-3">
          <span className="text-[11px] text-stone-500 uppercase tracking-wider font-medium">
            Evaluated / Awarded
          </span>
          <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
            {evaluatedCount}
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">
            Ranked via SAW Engine
          </span>
        </div>

        <div className="gov-panel p-3">
          <span className="text-[11px] text-stone-500 uppercase tracking-wider font-medium">
            Completed / Closed
          </span>
          <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
            {closedCount}
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">
            Archived Audit Logs
          </span>
        </div>

        <div className="gov-panel p-3">
          <span className="text-[11px] text-stone-500 uppercase tracking-wider font-medium">
            Total Bids Submitted
          </span>
          <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
            {totalBidsCount}
          </div>
          <span className="text-[11px] text-brand flex items-center gap-1 mt-1 font-mono">
            <ShieldCheck className="w-3.5 h-3.5" /> SHA-256 Verified
          </span>
        </div>
      </div>

      {/* Tenders Table */}
      <div className="gov-panel p-0 overflow-hidden">
        <div className="p-3 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-sm font-bold text-stone-800">Procurement Registry Overview</h2>
            <p className="text-[11px] text-stone-500">Real-time status of government procurement notices</p>
          </div>
          <Link to="/tenders" className="text-xs text-brand hover:underline font-medium flex items-center gap-1">
            <span>View Full Registry</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-stone-500">Loading tenders...</div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Tender Code</th>
                  <th>Title & Department</th>
                  <th>Status</th>
                  <th>Lock State</th>
                  <th>Max Budget (INR)</th>
                  <th>Deadline</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenders.slice(0, 6).map((t) => (
                  <tr key={t._id}>
                    <td className="font-mono text-xs font-semibold text-stone-900 whitespace-nowrap">
                      {t.tenderCode}
                    </td>
                    <td>
                      <div className="font-medium text-stone-900 text-xs">{t.title}</div>
                      <div className="text-[11px] text-stone-500">{t.department} • {t.category}</div>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="font-mono text-xs text-stone-600">
                      {t.configLockState}
                    </td>
                    <td className="font-mono text-xs text-stone-800">
                      ₹{(t.constraints?.maxBudgetMinor ? t.constraints.maxBudgetMinor / 100 : 0).toLocaleString('en-IN')}
                    </td>
                    <td className="text-xs text-stone-600 whitespace-nowrap">
                      {new Date(t.deadlineAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="text-right">
                      <Link
                        to={`/tenders/${t._id}`}
                        className="btn-secondary text-xs px-2.5 py-1"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
