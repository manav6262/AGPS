import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';
import { ITender } from '@agps/shared';
import { StatusBadge } from '../components/common/StatusBadge.js';
import {
  Building2,
  FileText,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Award,
  Layers,
} from 'lucide-react';

export const OfficerDashboard: React.FC = () => {
  const { user } = useAuth();
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
        console.error('Failed to load officer dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const departmentName: string =
    typeof user?.department === 'object' && user?.department && 'name' in user.department
      ? String((user.department as any).name)
      : typeof user?.department === 'string'
      ? user.department
      : 'Authorized Department';

  const departmentCode: string =
    typeof user?.department === 'object' && user?.department && 'code' in user.department
      ? String((user.department as any).code)
      : '';

  const activeCount =
    summary?.activeTenders ??
    tenders.filter((t) => t.status === 'PUBLISHED' || t.status === 'BIDDING_OPEN').length;
  const draftCount = tenders.filter((t) => t.status === 'DRAFT').length;
  const pendingEvalCount = tenders.filter(
    (t) => t.status === 'BIDDING_CLOSED' || t.status === 'FINANCIAL_OPEN'
  ).length;
  const completedCount =
    summary?.evaluatedTenders ??
    tenders.filter(
      (t) => t.status === 'EVALUATED' || t.status === 'WINNER_SELECTED' || t.status === 'CLOSED'
    ).length;

  return (
    <div className="space-y-6">
      {/* Officer & Department Header Banner */}
      <div className="bg-white border border-stone-300 rounded p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-brand text-white">
              PROCUREMENT OFFICER
            </span>
            {departmentCode && (
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-300">
                {departmentCode}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-stone-900 mt-1.5">
            Government Procurement Dashboard
          </h1>
          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-stone-600 mt-1">
            <span>
              Officer: <strong className="text-stone-800">{user?.name}</strong> ({user?.email})
            </span>
            <span className="flex items-center gap-1 font-medium text-brand">
              <Building2 className="w-3.5 h-3.5" />
              <span>Department: {departmentName}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/tenders/new" className="btn-primary flex items-center gap-1.5 text-xs py-2 px-3">
            <PlusCircle className="w-4 h-4" />
            <span>Create Department Tender</span>
          </Link>
        </div>
      </div>

      {/* Scoped KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="gov-panel p-3">
          <span className="text-[11px] text-stone-500 uppercase tracking-wider font-medium flex items-center justify-between">
            <span>Active Tenders</span>
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
          </span>
          <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
            {activeCount}
          </div>
          <span className="text-[11px] text-status-passedText flex items-center gap-1 mt-1">
            <CheckCircle2 className="w-3 h-3" /> Live Bidding Open
          </span>
        </div>

        <div className="gov-panel p-3">
          <span className="text-[11px] text-stone-500 uppercase tracking-wider font-medium flex items-center justify-between">
            <span>Evaluation Pending</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </span>
          <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
            {pendingEvalCount}
          </div>
          <span className="text-[11px] text-amber-700 flex items-center gap-1 mt-1">
            <AlertTriangle className="w-3 h-3" /> Bidding Closed / Sealed
          </span>
        </div>

        <div className="gov-panel p-3">
          <span className="text-[11px] text-stone-500 uppercase tracking-wider font-medium flex items-center justify-between">
            <span>Completed / Awarded</span>
            <Award className="w-3.5 h-3.5 text-blue-600" />
          </span>
          <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
            {completedCount}
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">
            Ranked & Finalized
          </span>
        </div>

        <div className="gov-panel p-3">
          <span className="text-[11px] text-stone-500 uppercase tracking-wider font-medium flex items-center justify-between">
            <span>Draft Tenders</span>
            <FileText className="w-3.5 h-3.5 text-stone-400" />
          </span>
          <div className="text-2xl font-bold text-stone-900 mt-1 font-mono">
            {draftCount}
          </div>
          <span className="text-[11px] text-stone-500 mt-1 block">
            Awaiting Publication
          </span>
        </div>
      </div>

      {/* Department Tenders Section */}
      <div className="gov-panel p-0 overflow-hidden">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
              Department Tenders & Procurement Dossiers
            </h2>
            <p className="text-[11px] text-stone-500">
              Procurement notices strictly scoped to {departmentName}
            </p>
          </div>
          <Link
            to="/tenders"
            className="text-xs text-brand hover:underline flex items-center gap-1 font-medium"
          >
            <span>View All Registry Tenders</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-100 border-b border-stone-200 text-stone-700 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-4">Tender Code</th>
                <th className="py-2.5 px-4">Scope / Title</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Budget Ceiling</th>
                <th className="py-2.5 px-4">Bids Received</th>
                <th className="py-2.5 px-4">Closing Date</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {loading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-500 font-mono">
                    Loading department procurement tenders...
                  </td>
                </tr>
              )}

              {!loading && tenders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-500">
                    No procurement tenders currently assigned to {departmentName}.
                    <div className="mt-2">
                      <Link to="/tenders/new" className="text-brand font-medium hover:underline">
                        + Initialize First Tender
                      </Link>
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                tenders.map((tender) => (
                  <tr key={tender._id} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-stone-900">
                      {tender.tenderCode}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-stone-900">{tender.title}</div>
                      <div className="text-[11px] text-stone-500">{tender.category}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={tender.status} />
                    </td>
                    <td className="py-2.5 px-4 font-mono text-stone-800">
                      {tender.constraints?.maxBudgetMinor
                        ? `₹${(tender.constraints.maxBudgetMinor / 10000000).toFixed(2)} Cr`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono">
                      <span className="font-semibold text-stone-900">
                        {(tender as any).bidCount ?? 0}
                      </span>{' '}
                      bids
                    </td>
                    <td className="py-2.5 px-4 text-stone-500 font-mono text-[11px]">
                      {tender.deadlineAt ? new Date(tender.deadlineAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      <Link
                        to={`/tenders/${tender._id}`}
                        className="btn-secondary text-[11px] py-1 px-2.5"
                      >
                        Manage
                      </Link>
                      {(tender.status === 'EVALUATED' || tender.status === 'WINNER_SELECTED') && (
                        <Link
                          to={`/evaluations/${tender._id}`}
                          className="btn-primary text-[11px] py-1 px-2.5"
                        >
                          Rankings
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scope Security Info */}
      <div className="p-3.5 bg-stone-100 border border-stone-300 rounded text-xs text-stone-600 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-brand shrink-0 mt-0.5" />
        <div>
          <strong className="text-stone-800">Department Procurement Isolation Active:</strong> As an authorized
          Procurement Officer for <strong>{departmentName}</strong>, your operations, bids review, evaluations,
          and award lifecycle are strictly scoped to tenders within your departmental domain. Tenders and commercial
          bids of other ministries are cryptographically segregated.
        </div>
      </div>
    </div>
  );
};
