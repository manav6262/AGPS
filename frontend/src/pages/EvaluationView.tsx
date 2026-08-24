import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { ProvenanceBadge } from '../components/common/ProvenanceBadge.js';
import { SensitivitySimulator } from '../components/analysis/SensitivitySimulator.js';
import { BreakevenCalculator } from '../components/analysis/BreakevenCalculator.js';
import { RobustnessSummary } from '../components/analysis/RobustnessSummary.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Award,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  Columns,
  CheckCircle2,
  XCircle,
  Table,
  Sliders,
  Target,
  Activity,
} from 'lucide-react';

export const EvaluationView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'SENSITIVITY' | 'BREAKEVEN' | 'ROBUSTNESS'>('MATRIX');

  // Human Override Modal State
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedOverrideBidId, setSelectedOverrideBidId] = useState('');
  const [overrideJustification, setOverrideJustification] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Comparison Matrix State
  const [showComparison, setShowComparison] = useState(false);
  const [comparedBidIds, setComparedBidIds] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<any | null>(null);

  const fetchExplainability = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.tenders.getExplainability(id);
      setReport(res.report);
      if (res.report.results && res.report.results.length > 0) {
        setComparedBidIds(res.report.results.slice(0, 2).map((r: any) => r.bidId));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load explainability breakdown');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchExplainability();
  }, [fetchExplainability]);

  const handleFetchComparison = async () => {
    if (!id || comparedBidIds.length < 2) return;
    try {
      const res = await api.tenders.compareBids(id, comparedBidIds);
      setComparisonData(res.comparison);
      setShowComparison(true);
    } catch (err: any) {
      setError(err.message || 'Failed to generate comparative analysis');
    }
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedOverrideBidId) return;
    setError(null);
    setSubmittingOverride(true);

    try {
      await api.tenders.overrideWinner(id, selectedOverrideBidId, overrideJustification);
      setActionSuccess('Human winner override successfully executed with cryptographic audit logging!');
      setShowOverrideModal(false);
      await fetchExplainability();
    } catch (err: any) {
      setError(err.message || 'Winner override failed');
    } finally {
      setSubmittingOverride(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-stone-500">Generating SAW explainability report...</div>;
  }

  if (!report) {
    return <div className="p-8 text-center text-xs text-status-failedText">Explainability report unavailable.</div>;
  }

  const eligibleResults = report.results?.filter((r: any) => r.eligible) || [];
  const ineligibleResults = report.results?.filter((r: any) => !r.eligible) || [];
  const winnerResult = eligibleResults.find((r: any) => r.rank === 1);

  return (
    <div className="space-y-6">
      {/* Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link
            to={`/tenders/${id}`}
            className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-1 mb-1 font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Tender Dossier</span>
          </Link>
          <h1 className="text-lg font-bold text-stone-900">
            SAW Evaluation & Analytical Toolkit: {report.tenderCode}
          </h1>
          <p className="text-xs text-stone-500">
            Transparent scoring matrix, real-time weight sensitivity simulator, and breakeven calculators
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleFetchComparison}
            disabled={eligibleResults.length < 2}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Side-by-Side Comparison</span>
          </button>

          {user?.role === 'ADMIN' && report.status === 'EVALUATED' && (
            <button
              onClick={() => setShowOverrideModal(true)}
              className="btn-secondary text-xs text-brand border-brand flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-brand" />
              <span>Human Winner Override</span>
            </button>
          )}
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-status-passedBg border border-status-passedBorder rounded-sm text-status-passedText text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Snapshot Verification Bar */}
      <div className="bg-stone-100 border border-stone-300 rounded p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
          <span className="font-mono text-stone-800">
            Frozen Config Hash: <strong className="break-all">{report.configHash}</strong>
          </span>
        </div>
        <span className="font-mono text-[11px] text-stone-500 whitespace-nowrap">
          Evaluated: {new Date(report.evaluatedAt).toLocaleString('en-IN')}
        </span>
      </div>

      {/* Recommended Winner Banner */}
      {winnerResult && (
        <div className="gov-panel bg-[#F0FDF4] border-[#BBF7D0]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#15803D] uppercase tracking-wider">
                <Award className="w-4 h-4" />
                <span>Recommended Winner (Rank 1)</span>
              </div>
              <div className="text-xl font-bold text-stone-900 mt-1">
                {winnerResult.vendorName}
              </div>
              <p className="text-xs text-stone-600">
                Bid ID: <span className="font-mono">{winnerResult.bidId}</span> • Final Score:{' '}
                <strong className="text-[#15803D] font-mono text-sm">
                  {winnerResult.finalScore?.toFixed(4)}/100
                </strong>
              </p>
            </div>
            <div className="text-xs text-stone-500 font-mono text-right">
              <div>Total Bids Evaluated: {report.summary?.totalBids}</div>
              <div>Eligible Cohort: {report.summary?.eligibleCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Analytical Tab Navigation */}
      <div className="border-b border-stone-300 flex space-x-2">
        <button
          onClick={() => setActiveTab('MATRIX')}
          className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'MATRIX'
              ? 'border-brand text-brand bg-white'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          <span>SAW Scoring Matrix</span>
        </button>

        <button
          onClick={() => setActiveTab('SENSITIVITY')}
          className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'SENSITIVITY'
              ? 'border-brand text-brand bg-white'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Weight Sensitivity Simulator</span>
        </button>

        <button
          onClick={() => setActiveTab('BREAKEVEN')}
          className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'BREAKEVEN'
              ? 'border-brand text-brand bg-white'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          <span>Breakeven Delta Calculator</span>
        </button>

        <button
          onClick={() => setActiveTab('ROBUSTNESS')}
          className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'ROBUSTNESS'
              ? 'border-brand text-brand bg-white'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Ranking Robustness & Margin</span>
        </button>
      </div>

      {/* Tab 1: SAW Scoring Matrix */}
      {activeTab === 'MATRIX' && (
        <div className="space-y-6">
          <div className="gov-panel p-0 overflow-hidden">
            <div className="p-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
              <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                Official SAW Ranking Matrix (Eligible Cohort)
              </h2>
              <span className="text-[11px] text-stone-500">
                Raw Values • Normalized Scores [0..100] • Weight-Factored Scores
              </span>
            </div>

            {eligibleResults.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500">No eligible bids ranked.</div>
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Vendor Name & Bid</th>
                      {report.scoringCriteria?.map((c: any) => (
                        <th key={c.key} className="text-center">
                          <div>{c.label}</div>
                          <div className="text-[10px] text-stone-500 font-normal">
                            ({c.weight}% • {c.direction})
                          </div>
                        </th>
                      ))}
                      <th className="text-right font-bold">Final Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleResults.map((r: any) => (
                      <tr key={r.bidId} className={r.rank === 1 ? 'bg-[#F0FDF4]/40 font-medium' : ''}>
                        <td className="font-mono text-xs font-bold text-center">
                          {r.rank === 1 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-[#15803D] text-white rounded-full text-xs">
                              1
                            </span>
                          ) : (
                            `#${r.rank}`
                          )}
                        </td>
                        <td>
                          <div className="text-xs font-bold text-stone-900">{r.vendorName}</div>
                          <div className="font-mono text-[11px] text-stone-500">{r.bidId.slice(-8)}</div>
                        </td>
                        {report.scoringCriteria?.map((c: any) => {
                          const item = r.breakdown?.find((b: any) => b.key === c.key);
                          return (
                            <td key={c.key} className="text-center text-xs">
                              <div className="font-mono font-semibold text-stone-900">
                                {typeof item?.rawValue === 'number'
                                  ? c.key === 'price'
                                    ? `₹${(item.rawValue / 100).toLocaleString('en-IN')}`
                                    : item.rawValue
                                  : item?.rawValue ?? '—'}
                              </div>
                              <div className="text-[10px] text-stone-500 font-mono">
                                Norm: {item?.normalizedScore?.toFixed(1)} | Wgt: {item?.weightedScore?.toFixed(2)}
                              </div>
                              <div className="mt-0.5">
                                <ProvenanceBadge
                                  status={item?.provenance?.status || 'UNVERIFIED'}
                                  source={item?.provenance?.source}
                                />
                              </div>
                            </td>
                          );
                        })}
                        <td className="text-right font-mono text-sm font-bold text-stone-900">
                          {r.finalScore?.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Disqualified List */}
          {ineligibleResults.length > 0 && (
            <div className="gov-panel p-0 overflow-hidden border-status-failedBorder">
              <div className="p-3 border-b border-status-failedBorder bg-status-failedBg/40 flex items-center justify-between">
                <h2 className="text-xs font-bold text-status-failedText uppercase tracking-wider">
                  Disqualified / Ineligible Bids ({ineligibleResults.length})
                </h2>
                <span className="text-[11px] text-stone-500">Excluded from normalization and ranking</span>
              </div>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Vendor Name</th>
                      <th>Bid ID</th>
                      <th>Failed Eligibility Rules</th>
                      <th>Disqualification Rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ineligibleResults.map((r: any) => (
                      <tr key={r.bidId}>
                        <td className="font-medium text-xs text-stone-900">{r.vendorName}</td>
                        <td className="font-mono text-xs text-stone-500">{r.bidId}</td>
                        <td className="text-xs font-mono text-status-failedText">
                          {r.failedRules?.map((f: any) => f.code).join(', ') || 'CONSTRAINT_VIOLATION'}
                        </td>
                        <td className="text-xs text-stone-600">
                          {r.failedRules?.map((f: any) => f.message).join('; ') || 'Did not meet mandatory constraints'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Sensitivity Simulator */}
      {activeTab === 'SENSITIVITY' && (
        <SensitivitySimulator
          results={report.results || []}
          criteria={report.scoringCriteria || []}
        />
      )}

      {/* Tab 3: Breakeven Calculator */}
      {activeTab === 'BREAKEVEN' && (
        <BreakevenCalculator
          results={report.results || []}
          criteria={report.scoringCriteria || []}
        />
      )}

      {/* Tab 4: Robustness Summary */}
      {activeTab === 'ROBUSTNESS' && (
        <RobustnessSummary
          results={report.results || []}
          criteria={report.scoringCriteria || []}
        />
      )}

      {/* Side-by-Side Comparison Modal */}
      {showComparison && comparisonData && (
        <div className="gov-panel border-stone-400">
          <div className="gov-panel-header">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Side-by-Side Bid Comparison</h3>
              <p className="text-xs text-stone-500">Comparative criteria values and scores</p>
            </div>
            <button
              onClick={() => setShowComparison(false)}
              className="text-xs text-stone-500 hover:text-stone-800"
            >
              Close Comparison
            </button>
          </div>

          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Criterion</th>
                  <th>Weight</th>
                  {comparisonData.comparedBids?.map((b: any) => (
                    <th key={b.bidId} className="text-center">
                      <div>{b.vendorName}</div>
                      <div className="font-mono text-[10px] text-stone-500">
                        Rank #{b.rank} • Score: {b.finalScore?.toFixed(2)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonData.criteriaMatrix?.map((c: any) => (
                  <tr key={c.criterionKey}>
                    <td className="font-medium text-xs text-stone-900">
                      {c.label} ({c.unit})
                    </td>
                    <td className="font-mono text-xs text-stone-700">{c.weight}%</td>
                    {comparisonData.comparedBids?.map((b: any) => {
                      const entry = c.bids[b.bidId];
                      return (
                        <td key={b.bidId} className="text-center text-xs">
                          <div className="font-mono font-bold text-stone-900">
                            {typeof entry?.rawValue === 'number'
                              ? c.criterionKey === 'price'
                                ? `₹${(entry.rawValue / 100).toLocaleString('en-IN')}`
                                : entry.rawValue
                              : entry?.rawValue ?? '—'}
                          </div>
                          <div className="text-[10px] text-stone-500 font-mono">
                            Norm: {entry?.normalizedScore?.toFixed(1)} | Wgt: {entry?.weightedScore?.toFixed(2)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Human Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-none flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-stone-300 rounded max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2 text-brand font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>Authorized Human Winner Override</span>
              </div>
              <button
                onClick={() => setShowOverrideModal(false)}
                className="text-stone-400 hover:text-stone-700 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-600">
              Procurement policy permits authorized officer override of the recommended winner.
              <strong className="text-stone-800 block mt-1">
                A non-empty justification of at least 10 characters is mandatory and will be cryptographically hashed into the permanent audit chain.
              </strong>
            </p>

            <form onSubmit={handleOverrideSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Select Target Eligible Bid *
                </label>
                <select
                  required
                  value={selectedOverrideBidId}
                  onChange={(e) => setSelectedOverrideBidId(e.target.value)}
                  className="w-full text-xs"
                >
                  <option value="">-- Choose eligible vendor to award --</option>
                  {eligibleResults.map((r: any) => (
                    <option key={r.bidId} value={r.bidId}>
                      Rank #{r.rank}: {r.vendorName} (Score: {r.finalScore?.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Mandatory Justification & Statutory Rationale *
                </label>
                <textarea
                  required
                  minLength={10}
                  rows={3}
                  value={overrideJustification}
                  onChange={(e) => setOverrideJustification(e.target.value)}
                  placeholder="Explain why the recommended winner is overridden (e.g. specialized maintenance warranty, critical delivery SLA)..."
                  className="w-full text-xs"
                />
                <span className="text-[11px] text-stone-500">
                  {overrideJustification.length}/10 characters minimum
                </span>
              </div>

              <div className="pt-3 border-t border-stone-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOverride || overrideJustification.trim().length < 10 || !selectedOverrideBidId}
                  className="btn-primary text-xs"
                >
                  {submittingOverride ? 'Executing Override...' : 'Confirm Override & Award'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
