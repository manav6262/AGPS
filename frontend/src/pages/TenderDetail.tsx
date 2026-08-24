import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { ITender, IBid, EvaluationResult } from '@agps/shared';
import { StatusBadge } from '../components/common/StatusBadge.js';
import { ConfirmModal } from '../components/common/ConfirmModal.js';
import { useAuth } from '../context/AuthContext.js';
import {
  ShieldCheck,
  Award,
  FileCheck,
  Send,
  Eye,
  CheckCircle2,
  Lock,
  ArrowLeft,
  XCircle,
} from 'lucide-react';

export const TenderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [tender, setTender] = useState<ITender | null>(null);
  const [bids, setBids] = useState<IBid[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  // Confirmation Modal States
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    variant?: 'primary' | 'warning' | 'danger';
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: async () => {},
  });

  // Bid submission state for vendors
  const [bidPricePaise, setBidPricePaise] = useState<number>(5000000000);
  const [bidDeliveryDays, setBidDeliveryDays] = useState<number>(30);
  const [submittingBid, setSubmittingBid] = useState(false);

  const fetchTenderData = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.tenders.getById(id);
      setTender(res.tender);

      try {
        const bidsRes = await api.tenders.getBids(id);
        setBids(bidsRes.bids || []);
      } catch {
        // Restricted
      }

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

  const executeTransition = async (targetStatus: string) => {
    if (!id) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.tenders.transition(id, targetStatus);
      setActionSuccess(`Tender successfully transitioned to '${targetStatus}'.`);
      await fetchTenderData();
    } catch (err: any) {
      setActionError(err.message || 'Lifecycle transition failed');
    }
  };

  const handlePublishClick = () => {
    setModalConfig({
      isOpen: true,
      title: 'Publish Procurement Notice & Freeze Configuration Snapshot',
      description:
        'Publishing this tender will compute a permanent SHA-256 configuration hash over all scoring criteria, weights, and constraints. Once published, weights cannot be modified without a formal soft-locked revision.',
      confirmLabel: 'Confirm & Publish Tender',
      variant: 'primary',
      onConfirm: async () => {
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
        await executeTransition('PUBLISHED');
      },
    });
  };

  const handleCancelClick = () => {
    setModalConfig({
      isOpen: true,
      title: 'Cancel Procurement Tender Dossier',
      description:
        'Cancelling this tender will immediately abort all active bidding windows and invalidate submitted proposals. This action is recorded permanently in the cryptographic audit chain.',
      confirmLabel: 'Confirm Tender Cancellation',
      variant: 'danger',
      onConfirm: async () => {
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
        await executeTransition('CANCELLED');
      },
    });
  };

  const handleConfirmWinnerClick = () => {
    setModalConfig({
      isOpen: true,
      title: 'Confirm Automated SAW Winner Award',
      description:
        'Confirming the award officially selects the Rank #1 winner computed by the Simple Additive Weighting engine and moves the dossier into WINNER_SELECTED.',
      confirmLabel: 'Confirm Award Selection',
      variant: 'primary',
      onConfirm: async () => {
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
        setActionError(null);
        setActionSuccess(null);
        try {
          await api.tenders.confirmWinner(id!);
          setActionSuccess('Winner award confirmed and tender moved to WINNER_SELECTED.');
          await fetchTenderData();
        } catch (err: any) {
          setActionError(err.message || 'Winner confirmation failed');
        }
      },
    });
  };

  const handleCloseTenderClick = () => {
    setModalConfig({
      isOpen: true,
      title: 'Finalize and Close Procurement Tender',
      description:
        'Closing this tender archives the dossier, verifies the unbroken cryptographic audit hash chain, and locks all records against further administrative modifications.',
      confirmLabel: 'Confirm Final Closure',
      variant: 'primary',
      onConfirm: async () => {
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
        setActionError(null);
        setActionSuccess(null);
        try {
          await api.tenders.close(id!, 'Procurement finalized by authorized officer');
          setActionSuccess('Tender successfully closed.');
          await fetchTenderData();
        } catch (err: any) {
          setActionError(err.message || 'Closure failed');
        }
      },
    });
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
    return (
      <div className="p-8 text-center text-xs text-stone-500 font-mono" role="status" aria-live="polite">
        Loading procurement tender dossier...
      </div>
    );
  }

  if (!tender) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="text-xs text-status-failedText font-bold">Tender Dossier Not Found</div>
        <Link to="/tenders" className="btn-secondary text-xs">
          Return to Registry
        </Link>
      </div>
    );
  }

  const isBiddingOpen = tender.status === 'BIDDING_OPEN';
  const isVendor = user?.role === 'VENDOR';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        description={modalConfig.description}
        confirmLabel={modalConfig.confirmLabel}
        variant={modalConfig.variant}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Top Breadcrumb & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link
            to="/tenders"
            className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-1 mb-1 font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Tenders Registry</span>
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-stone-900">{tender.tenderCode}</h1>
            <StatusBadge status={tender.status} />
          </div>
          <p className="text-xs text-stone-500">{tender.title}</p>
        </div>

        {/* Action Controls for Admin */}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {tender.status === 'DRAFT' && (
              <button
                onClick={handlePublishClick}
                className="btn-primary text-xs"
              >
                Publish Notice
              </button>
            )}

            {tender.status === 'PUBLISHED' && (
              <button
                onClick={() => executeTransition('BIDDING_OPEN')}
                className="btn-primary text-xs"
              >
                Open Bidding Window
              </button>
            )}

            {tender.status === 'BIDDING_OPEN' && (
              <button
                onClick={() => executeTransition('BIDDING_CLOSED')}
                className="btn-secondary text-xs"
              >
                Close Bidding Window
              </button>
            )}

            {tender.status === 'BIDDING_CLOSED' && (
              <button
                onClick={() => executeTransition('FINANCIAL_OPEN')}
                className="btn-primary text-xs"
              >
                Open Financial Envelopes
              </button>
            )}

            {tender.status === 'FINANCIAL_OPEN' && (
              <button
                onClick={handleRunEvaluation}
                disabled={evaluating}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <Award className="w-4 h-4" />
                <span>{evaluating ? 'Running Evaluation Engine...' : 'Run SAW Evaluation'}</span>
              </button>
            )}

            {tender.status === 'EVALUATED' && (
              <button
                onClick={handleConfirmWinnerClick}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Award Decision</span>
              </button>
            )}

            {tender.status === 'WINNER_SELECTED' && (
              <button
                onClick={handleCloseTenderClick}
                className="btn-primary text-xs"
              >
                Finalize & Close Tender
              </button>
            )}

            {tender.status !== 'CLOSED' && tender.status !== 'CANCELLED' && (
              <button
                onClick={handleCancelClick}
                className="btn-danger text-xs"
              >
                Cancel Tender
              </button>
            )}
          </div>
        )}
      </div>

      {actionSuccess && (
        <div className="p-3 bg-status-passedBg border border-status-passedBorder rounded-sm text-status-passedText text-xs flex items-center gap-2" role="status" aria-live="polite">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-center gap-2" role="alert">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Snapshot Verification Bar */}
      {tender.lockedConfig && (
        <div className="bg-stone-100 border border-stone-300 rounded p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
            <span className="font-mono text-stone-800">
              Configuration Snapshot Frozen (Hash: <strong className="break-all">{tender.lockedConfig.configHash}</strong>)
            </span>
          </div>
          <span className="font-mono text-[11px] text-stone-500 whitespace-nowrap">
            Lock State: {tender.configLockState}
          </span>
        </div>
      )}

      {/* Overview & Schedule */}
      <div className="gov-panel space-y-4">
        <div className="gov-panel-header">
          <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            1. Procurement Dossier Details
          </h2>
          <span className="text-[11px] text-stone-500 font-mono">{tender.department}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-stone-500 block">Scope of Work & Deliverables</span>
            <p className="text-stone-800 mt-1 leading-relaxed">{tender.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-stone-50 p-3 rounded border border-stone-200">
            <div>
              <span className="text-stone-500 block text-[11px]">Maximum Allocated Budget</span>
              <span className="font-mono text-xs font-bold text-stone-900">
                ₹{(tender.constraints?.maxBudgetMinor ? tender.constraints.maxBudgetMinor / 100 : 0).toLocaleString('en-IN')}
              </span>
            </div>

            <div>
              <span className="text-stone-500 block text-[11px]">Min Quality Threshold</span>
              <span className="font-mono text-xs font-bold text-stone-900">
                {tender.constraints?.minQualityScore ?? 0}/100
              </span>
            </div>

            <div>
              <span className="text-stone-500 block text-[11px]">Max Delivery Days</span>
              <span className="font-mono text-xs font-bold text-stone-900">
                {tender.constraints?.maxDeliveryDays ?? 0} Days
              </span>
            </div>

            <div>
              <span className="text-stone-500 block text-[11px]">Min Vendor Experience</span>
              <span className="font-mono text-xs font-bold text-stone-900">
                {tender.constraints?.minExperienceYears ?? 0} Years
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scoring Criteria Matrix */}
      <div className="gov-panel space-y-4">
        <div className="gov-panel-header">
          <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            2. Multi-Criteria Scoring Model (SAW Method)
          </h2>
          <span className="text-[11px] text-stone-500 font-mono">
            {tender.scoringCriteria?.length || 0} Dimensions • Weights Sum: 100%
          </span>
        </div>

        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scoring Criteria Dimensions">
          <table>
            <caption className="sr-only">Declared Multi-Criteria Scoring Model</caption>
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col">Evaluation Direction</th>
                <th scope="col">Allocated Weight</th>
                <th scope="col">Unit</th>
                <th scope="col">Data Value Source</th>
              </tr>
            </thead>
            <tbody>
              {tender.scoringCriteria?.map((c) => (
                <tr key={c.key}>
                  <td className="font-semibold text-xs text-stone-900">{c.label}</td>
                  <td className="font-mono text-xs text-stone-700 uppercase">
                    {c.direction === 'higher' ? 'Maximized (Higher is Better)' : 'Minimized (Lower is Better)'}
                  </td>
                  <td className="font-mono text-xs font-bold text-stone-900">{c.weight}%</td>
                  <td className="font-mono text-xs text-stone-600">{c.unit}</td>
                  <td className="font-mono text-xs text-stone-500">{c.valueSource?.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor Bid Submission Form */}
      {isVendor && isBiddingOpen && (
        <div className="gov-panel space-y-4 border-brand">
          <div className="gov-panel-header border-brand/30">
            <div>
              <h2 className="text-xs font-bold text-brand uppercase tracking-wider flex items-center gap-1.5">
                <Send className="w-4 h-4" />
                <span>Submit Sealed Procurement Bid</span>
              </h2>
              <p className="text-xs text-stone-500">
                Quotes remain cryptographically sealed until formal financial opening
              </p>
            </div>
            <span className="font-mono text-xs text-brand font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Two-Envelope Sealed
            </span>
          </div>

          <form onSubmit={handleSubmitBid} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="bid-price-input" className="block text-xs font-medium text-stone-700 mb-1">
                  Total Commercial Price (in Paise) *
                </label>
                <input
                  id="bid-price-input"
                  type="number"
                  required
                  min={1}
                  aria-describedby="bid-price-help"
                  value={bidPricePaise}
                  onChange={(e) => setBidPricePaise(Number(e.target.value))}
                  className="w-full text-xs font-mono"
                />
                <span id="bid-price-help" className="text-[11px] text-stone-500 mt-0.5 block">
                  Quote: ₹{(bidPricePaise / 100).toLocaleString('en-IN')} INR
                </span>
              </div>

              <div>
                <label htmlFor="bid-delivery-input" className="block text-xs font-medium text-stone-700 mb-1">
                  Delivery Timeline Commitment (Days) *
                </label>
                <input
                  id="bid-delivery-input"
                  type="number"
                  required
                  min={1}
                  aria-describedby="bid-delivery-help"
                  value={bidDeliveryDays}
                  onChange={(e) => setBidDeliveryDays(Number(e.target.value))}
                  className="w-full text-xs font-mono"
                />
                <span id="bid-delivery-help" className="text-[11px] text-stone-500 mt-0.5 block">
                  Maximum allowable: {tender.constraints?.maxDeliveryDays} days
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={submittingBid}
                className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs"
              >
                <FileCheck className="w-4 h-4" />
                <span>{submittingBid ? 'Submitting Sealed Bid...' : 'Submit Sealed Tender Bid'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Submitted Bids Listing */}
      <div className="gov-panel p-0 overflow-hidden">
        <div className="p-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Submitted Bids ({bids.length})
          </h2>
          <span className="text-[11px] font-mono text-stone-500">Envelope Sealing Active</span>
        </div>

        {bids.length === 0 ? (
          <div className="p-6 text-center text-xs text-stone-500" role="status" aria-live="polite">
            {isBiddingOpen
              ? 'No bids have been submitted yet. Eligible suppliers can submit commercial proposals above.'
              : 'No bids were recorded for this tender.'}
          </div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Submitted Bids Table">
            <table>
              <caption className="sr-only">Submitted Bids List</caption>
              <thead>
                <tr>
                  <th scope="col">Bid ID</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Revision</th>
                  <th scope="col">Commercial Price</th>
                  <th scope="col">Delivery Timeline</th>
                  <th scope="col">Quality Score</th>
                  <th scope="col">Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {bids.map((b) => (
                  <tr key={b._id}>
                    <td className="font-mono text-xs font-semibold text-stone-900">{b._id.slice(-8)}</td>
                    <td className="text-xs text-stone-800 font-medium">
                      {typeof b.vendor === 'object' ? (b.vendor as any).name : b.vendor}
                    </td>
                    <td className="font-mono text-xs text-center">v{b.revision}</td>
                    <td className="font-mono text-xs font-bold text-stone-900">
                      {b.priceMinor !== undefined
                        ? `₹${(b.priceMinor / 100).toLocaleString('en-IN')}`
                        : 'SEALED ENVELOPE'}
                    </td>
                    <td className="font-mono text-xs">{b.deliveryDays?.value || (b.deliveryDays as any)} Days</td>
                    <td className="font-mono text-xs">{b.derivedQualityScore ?? 0}/100</td>
                    <td className="text-xs text-stone-600">
                      {new Date(b.submittedAt).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Evaluation Outcomes Summary */}
      {evaluation && (
        <div className="gov-panel bg-stone-50 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-2">
            <div>
              <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4 text-brand" />
                <span>Deterministic SAW Evaluation Outcome</span>
              </h2>
              <p className="text-xs text-stone-500">
                Tender evaluated on {new Date(evaluation.evaluatedAt).toLocaleString('en-IN')} (Duration: {evaluation.durationMs}ms)
              </p>
            </div>
            <Link
              to={`/evaluations/${tender._id}`}
              className="btn-primary text-xs flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Open SAW Explainability & Simulation Toolkit</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white p-2.5 rounded border border-stone-200">
              <span className="text-stone-500 block text-[11px]">Outcome</span>
              <span className="font-bold text-stone-900 font-mono">{evaluation.summary?.outcome}</span>
            </div>
            <div className="bg-white p-2.5 rounded border border-stone-200">
              <span className="text-stone-500 block text-[11px]">Total Bids Screened</span>
              <span className="font-bold text-stone-900 font-mono">{evaluation.summary?.totalBids}</span>
            </div>
            <div className="bg-white p-2.5 rounded border border-stone-200">
              <span className="text-stone-500 block text-[11px]">Eligible Cohort</span>
              <span className="font-bold text-[#15803D] font-mono">{evaluation.summary?.eligibleCount}</span>
            </div>
            <div className="bg-white p-2.5 rounded border border-stone-200">
              <span className="text-stone-500 block text-[11px]">Disqualified Bids</span>
              <span className="font-bold text-status-failedText font-mono">{evaluation.summary?.rejectedCount}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
