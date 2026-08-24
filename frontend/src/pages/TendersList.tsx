import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { Tender } from '../types/index.js';
import { StatusBadge } from '../components/common/StatusBadge.js';
import { useAuth } from '../context/AuthContext.js';
import { Search, PlusCircle } from 'lucide-react';

export const TendersList: React.FC = () => {
  const { user } = useAuth();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    async function fetchTenders() {
      try {
        const res = await api.tenders.list();
        setTenders(res.tenders || []);
      } catch (err) {
        console.error('Failed to load tenders', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTenders();
  }, []);

  const filtered = tenders.filter((t) => {
    const matchSearch =
      t.tenderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.department.toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Procurement Tenders Registry</h1>
          <p className="text-xs text-stone-500">
            Official government procurement notices and active evaluation pipelines
          </p>
        </div>

        {user?.role === 'ADMIN' && (
          <Link to="/tenders/new" className="btn-primary flex items-center gap-1.5 self-start sm:self-auto">
            <PlusCircle className="w-4 h-4" />
            <span>Create New Tender</span>
          </Link>
        )}
      </div>

      {/* Filter Controls */}
      <div className="bg-white border border-stone-300 rounded p-3 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-stone-400" />
          <input
            type="text"
            placeholder="Search code, title, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs text-stone-600 font-medium whitespace-nowrap">Filter Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="BIDDING_OPEN">BIDDING OPEN</option>
            <option value="BIDDING_CLOSED">BIDDING CLOSED</option>
            <option value="EVALUATED">EVALUATED</option>
            <option value="WINNER_SELECTED">WINNER SELECTED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
      </div>

      {/* Tenders Table */}
      <div className="gov-panel p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-stone-500">Loading tenders registry...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500">No procurement tenders match your query.</div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Tender Code</th>
                  <th>Title & Scope</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Lock</th>
                  <th>Max Budget (INR)</th>
                  <th>Criteria</th>
                  <th>Deadline</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t._id}>
                    <td className="font-mono text-xs font-semibold text-stone-900 whitespace-nowrap">
                      {t.tenderCode}
                    </td>
                    <td>
                      <div className="font-medium text-stone-900 text-xs">{t.title}</div>
                      <div className="text-[11px] text-stone-500 line-clamp-1">{t.description}</div>
                    </td>
                    <td className="text-xs text-stone-700 whitespace-nowrap">
                      {t.department}
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="font-mono text-[11px] text-stone-600 whitespace-nowrap">
                      {t.configLockState}
                    </td>
                    <td className="font-mono text-xs text-stone-900 whitespace-nowrap">
                      ₹{(t.constraints?.maxBudgetMinor ? t.constraints.maxBudgetMinor / 100 : 0).toLocaleString('en-IN')}
                    </td>
                    <td className="text-center font-mono text-xs text-stone-700">
                      {t.scoringCriteria?.length || 0}
                    </td>
                    <td className="text-xs text-stone-600 whitespace-nowrap">
                      {new Date(t.deadlineAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        to={`/tenders/${t._id}`}
                        className="btn-secondary text-xs px-2.5 py-1"
                      >
                        Inspect
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
