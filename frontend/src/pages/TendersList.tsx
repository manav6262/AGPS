import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { ITender } from '@agps/shared';
import { StatusBadge } from '../components/common/StatusBadge.js';
import { useAuth } from '../context/AuthContext.js';
import { Search, PlusCircle, RotateCcw, FileText } from 'lucide-react';

export const TendersList: React.FC = () => {
  const { user } = useAuth();
  const [tenders, setTenders] = useState<ITender[]>([]);
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

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
  };

  return (
    <div className="space-y-4">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Procurement Tenders Registry</h1>
          <p className="text-xs text-stone-500">
            Official government procurement notices, live bidding windows, and evaluation pipelines
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
          <label htmlFor="tender-search" className="sr-only">Search tenders by code, title or department</label>
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-stone-400" aria-hidden="true" />
          <input
            id="tender-search"
            type="text"
            placeholder="Search code, title, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label htmlFor="tender-status-filter" className="text-xs text-stone-600 font-medium whitespace-nowrap">
            Filter Status:
          </label>
          <select
            id="tender-status-filter"
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

          {(searchTerm || statusFilter !== 'ALL') && (
            <button
              onClick={handleResetFilters}
              className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 text-stone-600"
              title="Reset search and filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Tenders Table */}
      <div className="gov-panel p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-stone-500" role="status" aria-live="polite">
            Loading procurement tenders registry...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-3" role="status" aria-live="polite">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center mx-auto text-stone-500">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-800">No Procurement Tenders Found</h2>
              <p className="text-xs text-stone-500 mt-0.5 max-w-md mx-auto">
                {searchTerm || statusFilter !== 'ALL'
                  ? 'No tenders match your active query. Try clearing your search keyword or resetting the status filter.'
                  : 'No tenders have been initialized yet. Authorized procurement officers can publish new tenders using the button below.'}
              </p>
            </div>
            <div className="pt-1 flex justify-center gap-2">
              {searchTerm || statusFilter !== 'ALL' ? (
                <button onClick={handleResetFilters} className="btn-secondary text-xs">
                  Clear Search & Filters
                </button>
              ) : user?.role === 'ADMIN' ? (
                <Link to="/tenders/new" className="btn-primary text-xs">
                  Create First Tender
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Procurement Tenders Data Table">
            <table>
              <caption className="sr-only">Official Government Procurement Tenders Registry</caption>
              <thead>
                <tr>
                  <th scope="col">Tender Code</th>
                  <th scope="col">Title & Scope</th>
                  <th scope="col">Department</th>
                  <th scope="col">Status</th>
                  <th scope="col">Lock State</th>
                  <th scope="col">Max Budget (INR)</th>
                  <th scope="col" className="text-center">Criteria</th>
                  <th scope="col">Deadline</th>
                  <th scope="col" className="text-right">Actions</th>
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
                        View Dossier
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
