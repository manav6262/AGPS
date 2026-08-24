import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { Tender, Bid, Evaluation } from '../types/index.js';
import { StatusBadge } from '../components/common/StatusBadge.js';
import { useAuth } from '../context/AuthContext.js';
import {
  ShieldCheck,
  Award,
  AlertCircle,
  FileCheck,
  Send,
  Eye,
} from 'lucide-react';

export const TenderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [tender, setTender] = useState<Tender | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  // Bid submission state for vendors
  const [bidPricePaise, setBidPricePaise] = useState<number>(5000000000);
  const [bidDeliveryDays, setBidDeliveryDays] = useState<number>(30);
  const [submittingBid, setSubmittingBid] = useState(false);

  const fetchTenderData = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.tenders.getById(id);
      setTender(res.tender);

      // Fetch bids if authorized
      try {
        const bidsRes = await api.tenders.getBids(id);
        setBids(bidsRes.bids || []);
      } catch {
        // May be restricted for general public
      }

      // Fetch evaluation if exists
      try {
        const evalRes = await api.tenders.getEvaluation(id);
        setEvaluation(evalRes.evaluation || null);
      } catch {
        // No evaluation yet
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to load tender details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTenderData();
  }, [fetchTenderData]);

  const handleTransition = async (targetStatus: string) => {
    if (!id) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.tenders.transition(id, targetStatus);
      setActionSuccess(`Tender successfully transitioned to '${targetStatus}'`);
      await fetchTenderData();
    } catch (err: any) {
      setActionError(err.message || 'Lifecycle transition failed');
    }
  };

  const handleRunEvaluation = async () => {
    if (!id) return;
    setActionError(null);
    setActionSuccess(null);
    setEvaluating(true);
    try {
      const res = await api.tenders.evaluate(id);
      setEvaluation(res.evaluation);
      setActionSuccess('SAW Evaluation completed successfully with deterministic ranking!');
      await fetchTenderData();
    } catch (err: any) {
      setActionError(err.message || 'Evaluation run failed');
    } finally {
      setEvaluating(false);
    }
  };

  const handleConfirmWinner = async () => {
    if (!id) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.tenders.confirmWinner(id);
      setActionSuccess('Winner award confirmed and tender moved to WINNER_SELECTED.');
      await fetchTenderData();
    } catch (err: any) {
      setActionError(err.message || 'Winner confirmation failed');
    }
  };

  const handleCloseTender = async () => {
    if (!id) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.tenders.close(id, 'Procurement finalized by authorized officer');
      setActionSuccess('Tender successfully closed.');
      await fetchTenderData();
    } catch (err: any) {
      setActionError(err.message || 'Closure failed');
    }
  };

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingBid(true);
    try {
      await api.tenders.submitBid(id, {
        priceMinor: bidPricePaise,
        deliveryDays: bidDeliveryDays,
      });
      setActionSuccess('Commercial and technical bid submitted securely in sealed envelope!');
      await fetchTenderData();
    } catch (err: any) {
      setActionError(err.message || 'Bid submission failed');
    } finally {
      setSubmittingBid(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-stone-500">Loading tender dossier...</div>;
  }

  if (!tender) {
    return <div className="p-8 text-center text-xs text-status-failedText">Tender dossier not found.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Action Messages */}
      {actionError && (
        <div className="p-3 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-status-passedBg border border-status-passedBorder rounded-sm text-status-passedText text-xs flex items-start gap-2">
          <FileCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main Dossier Header */}
      <div className="bg-white border border-stone-300 rounded p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-bold text-stone-900 bg-stone-100 px-2 py-0.5 border border-stone-300 rounded-sm">
              {tender.tenderCode}
            </span>
            <StatusBadge status={tender.status} />
            <span className="text-xs font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded-sm border border-stone-200">
              Lock: {tender.configLockState}
            </span>
          </div>
          <h1 className="text-xl font-bold text-stone-900">{tender.title}</h1>
          <p className="text-xs text-stone-600 mt-1 max-w-3xl">{tender.description}</p>
          <div className="text-xs text-stone-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span>Department: <strong className="text-stone-700">{tender.department}</strong></span>
            <span>Category: <strong className="text-stone-700">{tender.category}</strong></span>
            <span>Deadline: <strong className="text-stone-700">{new Date(tender.deadlineAt).toLocaleString('en-IN')}</strong></span>
          </div>
        </div>

        {/* Action Controls for Admin */}
        {user?.role === 'ADMIN' && (
          <div className="flex flex-wrap gap-2 self-start md:self-auto">
            {tender.status === 'DRAFT' && (
              <button
                onClick={() => handleTransition('PUBLISHED')}
                className="btn-primary text-xs"
              >
                Publish Tender
              </button>
            )}

            {tender.status === 'PUBLISHED' && (
              <button
                onClick={() => handleTransition('BIDDING_OPEN')}
                className="btn-primary text-xs"
              >
                Open Bidding
              </button>
            )}

            {tender.status === 'BIDDING_OPEN' && (
              <button
                onClick={() => handleTransition('BIDDING_CLOSED')}
                className="btn-secondary text-xs"
              >
                Close Bidding
              </button>
            )}

            {tender.status === 'BIDDING_CLOSED' && (
              <button
                onClick={handleRunEvaluation}
                disabled={evaluating}
                className="btn-primary text-xs"
              >
                {evaluating ? 'Running SAW Pipeline...' : 'Run Pure SAW Evaluation'}
              </button>
            )}

            {tender.status === 'EVALUATED' && (
              <>
                <button
                  onClick={handleConfirmWinner}
                  className="btn-primary text-xs flex items-center gap-1"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Confirm Winner</span>
                </button>
                <Link
                  to={`/evaluations/${tender._id}`}
                  className="btn-secondary text-xs flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Explainability & Override</span>
                </Link>
              </>
            )}

            {tender.status === 'WINNER_SELECTED' && (
              <button
                onClick={handleCloseTender}
                className="btn-secondary text-xs"
              >
                Finalize & Close Tender
              </button>
            )}
          </div>
        )}
      </div>

      {/* Snapshot Verification Box (If published / frozen) */}
      {tender.lockedConfig && (
        <div className="bg-stone-100 border border-stone-300 rounded p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
            <div>
              <span className="font-semibold text-stone-800">Frozen Configuration Snapshot (v{tender.lockedConfig.version})</span>
              <div className="font-mono text-[11px] text-stone-600 break-all">
                SHA-256 Hash: {tender.lockedConfig.configHash}
              </div>
            </div>
          </div>
          <span className="font-mono text-[11px] text-stone-500 whitespace-nowrap">
            Locked: {new Date(tender.lockedConfig.lockedAt).toLocaleDateString('en-IN')}
          </span>
        </div>
      )}

      {/* Evaluation Results Quick Preview (If evaluated) */}
      {evaluation && (
        <div className="gov-panel bg-[#F0FDF4] border-[#BBF7D0]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-[#15803D] uppercase tracking-wider">
                Evaluation Completed (Run #{evaluation.runNumber})
              </div>
              <div className="text-sm font-semibold text-stone-900 mt-1">
                Outcome: {evaluation.summary.outcome} • Recommended Winner:{' '}
                <span className="text-[#15803D] font-bold">
                  {evaluation.results.find((r) => r.bidId === evaluation.summary.winnerBid)?.vendorName || evaluation.summary.winnerBid || 'None'}
                </span>
                {evaluation.summary.winningScore && (
                  <span> (Score: {evaluation.summary.winningScore.toFixed(2)}/100)</span>
                )}
              </div>
            </div>
            <Link
              to={`/evaluations/${tender._id}`}
              className="btn-primary text-xs flex items-center gap-1"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Full Explainability Matrix</span>
            </Link>
          </div>
        </div>
      )}

      {/* Grid: Constraints & Scoring Criteria */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Constraints */}
        <div className="gov-panel">
          <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-200 pb-2 mb-3">
            Tender Constraints & Thresholds
          </h2>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-stone-100 pb-1">
              <dt className="text-stone-500">Max Budget Ceiling:</dt>
              <dd className="font-mono font-semibold text-stone-800">
                ₹{(tender.constraints?.maxBudgetMinor ? tender.constraints.maxBudgetMinor / 100 : 0).toLocaleString('en-IN')}
              </dd>
            </div>
            <div className="flex justify-between border-b border-stone-100 pb-1">
              <dt className="text-stone-500">Min Quality Score:</dt>
              <dd className="font-mono font-semibold text-stone-800">
                {tender.constraints?.minQualityScore}/100
              </dd>
            </div>
            <div className="flex justify-between border-b border-stone-100 pb-1">
              <dt className="text-stone-500">Max Delivery Timeline:</dt>
              <dd className="font-mono font-semibold text-stone-800">
                {tender.constraints?.maxDeliveryDays} Days
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Min Experience Required:</dt>
              <dd className="font-mono font-semibold text-stone-800">
                {tender.constraints?.minExperienceYears} Years
              </dd>
            </div>
          </dl>
        </div>

        {/* Scoring Criteria Matrix */}
        <div className="gov-panel md:col-span-2 p-0 overflow-hidden">
          <div className="p-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
            <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
              Scoring Criteria & Weight Matrix (SAW Model)
            </h2>
            <span className="text-[11px] font-mono font-bold text-stone-700">
              Total Weights: {tender.scoringCriteria?.reduce((acc, c) => acc + c.weight, 0)}%
            </span>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Criterion</th>
                  <th>Optimization</th>
                  <th>Weight</th>
                  <th>Unit</th>
                  <th>Value Source</th>
                </tr>
              </thead>
              <tbody>
                {tender.scoringCriteria?.map((c) => (
                  <tr key={c.key}>
                    <td className="font-medium text-stone-900 text-xs">{c.label}</td>
                    <td className="text-xs">
                      <span
                        className={`font-mono uppercase text-[11px] px-1.5 py-0.5 rounded-sm ${
                          c.direction === 'lower'
                            ? 'bg-stone-100 text-stone-700'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {c.direction === 'lower' ? 'Minimization (Lower)' : 'Maximization (Higher)'}
                      </span>
                    </td>
                    <td className="font-mono font-bold text-xs text-stone-900">{c.weight}%</td>
                    <td className="text-stone-600 text-xs">{c.unit}</td>
                    <td className="font-mono text-[11px] text-stone-500">{c.valueSource.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Vendor Bid Submission Form */}
      {user?.role === 'VENDOR' && (tender.status === 'BIDDING_OPEN' || tender.status === 'PUBLISHED') && (
        <div className="gov-panel">
          <div className="gov-panel-header">
            <div>
              <h2 className="text-sm font-bold text-stone-900">Commercial & Technical Bid Submission</h2>
              <p className="text-xs text-stone-500">
                Encrypted and sealed envelope. Financial price is sealed from review until financial unsealing.
              </p>
            </div>
            <span className="text-xs font-mono bg-stone-100 text-stone-600 px-2 py-0.5 border border-stone-300 rounded-sm">
              Two-Envelope Sealing Active
            </span>
          </div>

          <form onSubmit={handleSubmitBid} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Total Commercial Bid Price (Paise / Minor Units) *
              </label>
              <input
                type="number"
                required
                min={1}
                value={bidPricePaise}
                onChange={(e) => setBidPricePaise(Number(e.target.value))}
                className="w-full font-mono"
              />
              <span className="text-[11px] text-stone-500 mt-1 block">
                ₹{(bidPricePaise / 100).toLocaleString('en-IN')} INR
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Committed Delivery Timeline (Days) *
              </label>
              <input
                type="number"
                required
                min={1}
                value={bidDeliveryDays}
                onChange={(e) => setBidDeliveryDays(Number(e.target.value))}
                className="w-full font-mono"
              />
            </div>

            <div className="sm:col-span-2 pt-3 border-t border-stone-200 flex justify-end">
              <button
                type="submit"
                disabled={submittingBid}
                className="btn-primary px-4 py-2 flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span>{submittingBid ? 'Submitting Sealed Envelope...' : 'Submit Sealed Bid'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Submitted Bids Dossier Table (For Admin & Auditor) */}
      {(user?.role === 'ADMIN' || user?.role === 'AUDITOR') && (
        <div className="gov-panel p-0 overflow-hidden">
          <div className="p-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
            <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
              Submitted Bids Registry ({bids.length} Submissions)
            </h2>
            <span className="text-[11px] text-stone-500">
              {tender.status === 'BIDDING_OPEN' ? 'Prices Sealed (Two-Envelope Security)' : 'Unsealed for SAW Evaluation'}
            </span>
          </div>

          {bids.length === 0 ? (
            <div className="p-6 text-center text-xs text-stone-500">No bids submitted yet for this tender.</div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Bid ID</th>
                    <th>Vendor Entity</th>
                    <th>Revision</th>
                    <th>Price Minor</th>
                    <th>Delivery Days</th>
                    <th>Quality Score</th>
                    <th>Config Hash Match</th>
                    <th>Submission Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b) => (
                    <tr key={b._id}>
                      <td className="font-mono text-xs font-semibold text-stone-800 whitespace-nowrap">
                        {b._id.slice(-8)}
                      </td>
                      <td className="text-xs font-medium text-stone-900">
                        {typeof b.vendor === 'object' ? (b.vendor as any).name : b.vendor}
                      </td>
                      <td className="font-mono text-xs text-center">v{b.revision}</td>
                      <td className="font-mono text-xs">
                        {b.priceMinor !== undefined ? `₹${(b.priceMinor / 100).toLocaleString('en-IN')}` : (
                          <span className="text-stone-400 font-mono text-[11px]">SEALED (ENVELOPE B)</span>
                        )}
                      </td>
                      <td className="font-mono text-xs">{b.deliveryDays?.value || (b.deliveryDays as any)} Days</td>
                      <td className="font-mono text-xs">{b.derivedQualityScore}/100</td>
                      <td className="font-mono text-[11px] text-stone-500">
                        {b.configHashAtSubmission ? b.configHashAtSubmission.slice(0, 12) + '...' : 'N/A'}
                      </td>
                      <td className="text-xs text-stone-600 whitespace-nowrap">
                        {new Date(b.submittedAt).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
