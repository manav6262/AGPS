/**
 * Sensitivity & Breakeven Service (SPEC §13, §14.5, §18)
 *
 * Calls the pure engines in server/src/engines/ (evaluateTenderPure).
 * STRICTLY READ-ONLY: Never creates an Evaluation document, never mutates a Tender.
 */

import { Types } from 'mongoose';
import { Tender } from '../models/tender.js';
import { Bid } from '../models/bid.js';
import { User } from '../models/user.js';
import { AppError } from './tenderService.js';
import { evaluateTenderPure } from '../engines/evaluationEngine.js';
import {
  TenderConfigSnapshot,
  BidContext,
  ScoringCriterion,
  RankedResult,
} from '@agps/shared';

export interface SimulatedResultOutput {
  simulatedResults: RankedResult[];
  simulatedSummary: {
    totalBids: number;
    eligibleCount: number;
    rejectedCount: number;
    outcome: 'RANKED' | 'NO_ELIGIBLE_VENDORS';
    winnerBid?: string | null;
    winningScore?: number | null;
  };
  criteria: ScoringCriterion[];
}

export interface BreakevenCriterionRequirement {
  criterionKey: string;
  criterionLabel: string;
  currentValue: number;
  unit: string;
  direction: 'higher' | 'lower';
  requiredValue: number;
  delta: number;
  feasible: boolean;
  explanation: string;
}

export interface CriticalWeightBoundOutput {
  criterionKey: string;
  criterionLabel: string;
  currentWeight: number;
  switchThresholdWeight: number | null;
  newWinnerAtThreshold: string | null;
  stabilityMargin: number;
}

export interface BreakevenAnalysisOutput {
  tenderId: string;
  tenderCode: string;
  marginOfVictory: number;
  rank1Winner: { bidId: string; vendorName: string; score: number } | null;
  rank2RunnerUp: { bidId: string; vendorName: string; score: number } | null;
  criticalBounds: CriticalWeightBoundOutput[];
  breakevenByBid: Record<string, BreakevenCriterionRequirement[]>;
}

async function loadTenderAndBidContexts(tenderId: string | Types.ObjectId): Promise<{
  tender: any;
  snapshot: TenderConfigSnapshot;
  bidContexts: BidContext[];
}> {
  const tenderObjectId = new Types.ObjectId(tenderId);
  const tender = await Tender.findById(tenderObjectId).exec();
  if (!tender) {
    throw new AppError(404, 'TENDER_NOT_FOUND', 'Tender not found');
  }

  const rawSnapshot = tender.lockedConfig
    ? (tender.lockedConfig as any).toObject
      ? (tender.lockedConfig as any).toObject()
      : tender.lockedConfig
    : null;

  const snapshot: TenderConfigSnapshot =
    rawSnapshot ||
    ({
      version: 1,
      lockState: 'SOFT_LOCKED',
      lockedAt: new Date(),
      lockedBy: tender.createdBy?.toString() || 'SYSTEM',
      hardLockedAt: tender.firstBidAt,
      engineVersion: '1.0.0',
      rankingMethod: 'SAW',
      normalizationMethod: 'RATIO',
      constraints: (tender.constraints as any)?.toObject ? (tender.constraints as any).toObject() : tender.constraints,
      eligibilityRules: Array.isArray(tender.eligibilityRules)
        ? tender.eligibilityRules.map((r: any) => (r?.toObject ? r.toObject() : r))
        : [],
      technicalCriteria: Array.isArray(tender.technicalCriteria)
        ? tender.technicalCriteria.map((r: any) => (r?.toObject ? r.toObject() : r))
        : [],
      scoringCriteria: Array.isArray(tender.scoringCriteria)
        ? tender.scoringCriteria.map((r: any) => (r?.toObject ? r.toObject() : r))
        : [],
      tieBreakOrder: ['derivedQualityScore', 'priceMinor', 'submittedAt'],
      configHash: 'SIMULATION_ADHOC',
    } as TenderConfigSnapshot);

  const bids = await Bid.find({
    tender: tenderObjectId,
    isLatest: true,
  })
    .select('+priceMinor')
    .populate('vendor', 'name email')
    .exec();

  if (!bids || bids.length === 0) {
    throw new AppError(400, 'NO_BIDS', 'Tender has no submitted bids for sensitivity analysis');
  }

  const bidContexts: BidContext[] = bids.map((b) => ({
    bidId: b._id.toString(),
    vendorId: b.vendor ? (b.vendor as any)._id?.toString() || b.vendor.toString() : 'UNKNOWN',
    vendorName: (b.vendor as any)?.name || 'Unknown Vendor',
    submittedAt: b.submittedAt,
    priceMinor: b.priceMinor,
    deliveryDays: (b.deliveryDays as any)?.toObject ? (b.deliveryDays as any).toObject() : b.deliveryDays,
    vendorSnapshot: (b.vendorSnapshot as any)?.toObject ? (b.vendorSnapshot as any).toObject() : b.vendorSnapshot,
    technicalValues: b.technicalValues ? ((b.technicalValues as any).toObject ? (b.technicalValues as any).toObject() : b.technicalValues) : {},
    derivedQualityScore: b.derivedQualityScore,
  }));

  return { tender, snapshot, bidContexts };
}

/**
 * Simulate tender evaluation with arbitrary criterion weights
 * READ-ONLY: Pure in-memory execution, no DB writes.
 */
export async function simulateTenderEvaluation(
  tenderId: string,
  customCriteria: ScoringCriterion[]
): Promise<SimulatedResultOutput> {
  const sumWeights = customCriteria.reduce((acc, c) => acc + (Number(c.weight) || 0), 0);
  if (sumWeights !== 100) {
    throw new AppError(400, 'INVALID_WEIGHTS', `Simulated criteria weights must sum to 100% (received ${sumWeights}%)`);
  }

  const { snapshot, bidContexts } = await loadTenderAndBidContexts(tenderId);

  // Clone snapshot with custom criteria
  const simulatedSnapshot: TenderConfigSnapshot = {
    ...snapshot,
    scoringCriteria: customCriteria.map((c) => ({
      key: c.key,
      label: c.label,
      direction: c.direction,
      weight: Number(c.weight),
      unit: c.unit,
      valueSource: c.valueSource,
    })),
  };

  // Pure engine run
  const pureOutput = evaluateTenderPure(bidContexts, simulatedSnapshot);

  return {
    simulatedResults: pureOutput.results,
    simulatedSummary: pureOutput.summary,
    criteria: customCriteria,
  };
}

/**
 * Compute Breakeven Analysis & Critical Weight Stability Bounds
 * READ-ONLY: Pure in-memory calculation via evaluationEngine.
 */
export async function calculateTenderBreakeven(tenderId: string): Promise<BreakevenAnalysisOutput> {
  const { tender, snapshot, bidContexts } = await loadTenderAndBidContexts(tenderId);

  // Baseline evaluation using the official snapshot
  const baseline = evaluateTenderPure(bidContexts, snapshot);
  const eligible = baseline.results.filter((r) => r.eligible && r.breakdown);

  const rank1 = eligible.find((r) => r.rank === 1);
  const rank2 = eligible.find((r) => r.rank === 2);

  const marginOfVictory = rank1 && rank2 ? Math.max(0, (rank1.finalScore || 0) - (rank2.finalScore || 0)) : 0;

  // 1. Critical Weight Thresholds
  const originalWinnerName = rank1?.vendorName || '';
  const criticalBounds: CriticalWeightBoundOutput[] = snapshot.scoringCriteria.map((targetCriterion) => {
    let switchThresholdWeight: number | null = null;
    let newWinnerAtThreshold: string | null = null;

    for (let testW = 0; testW <= 100; testW += 1) {
      const remainingTotal = 100 - testW;
      const otherCriteria = snapshot.scoringCriteria.filter((c) => c.key !== targetCriterion.key);
      const sumOtherOriginalWeights = otherCriteria.reduce((acc, c) => acc + c.weight, 0) || 1;

      const simCriteria: ScoringCriterion[] = snapshot.scoringCriteria.map((c) => {
        if (c.key === targetCriterion.key) {
          return { ...c, weight: testW };
        }
        const scaledWeight = Math.round((c.weight / sumOtherOriginalWeights) * remainingTotal);
        return { ...c, weight: scaledWeight };
      });

      // Normalize sum to exactly 100
      const currentSum = simCriteria.reduce((a, b) => a + b.weight, 0);
      const diff = 100 - currentSum;
      if (diff !== 0 && otherCriteria.length > 0) {
        const firstOther = simCriteria.find((c) => c.key === otherCriteria[0].key);
        if (firstOther) firstOther.weight = Math.max(0, firstOther.weight + diff);
      }

      const simSnapshot: TenderConfigSnapshot = { ...snapshot, scoringCriteria: simCriteria };
      const simOut = evaluateTenderPure(bidContexts, simSnapshot);
      const simWinner = simOut.results.find((r) => r.rank === 1)?.vendorName;

      if (simWinner && simWinner !== originalWinnerName && switchThresholdWeight === null) {
        switchThresholdWeight = testW;
        newWinnerAtThreshold = simWinner;
      }
    }

    const stabilityMargin = switchThresholdWeight !== null ? Math.abs(switchThresholdWeight - targetCriterion.weight) : 100;

    return {
      criterionKey: targetCriterion.key,
      criterionLabel: targetCriterion.label,
      currentWeight: targetCriterion.weight,
      switchThresholdWeight,
      newWinnerAtThreshold,
      stabilityMargin,
    };
  });

  // 2. Single-Parameter Breakeven Deltas for each non-winning bid
  const breakevenByBid: Record<string, BreakevenCriterionRequirement[]> = {};

  if (rank1) {
    for (const targetBid of eligible) {
      if (targetBid.rank === 1) {
        breakevenByBid[targetBid.bidId] = snapshot.scoringCriteria.map((c) => {
          const item = targetBid.breakdown?.find((b) => b.key === c.key);
          return {
            criterionKey: c.key,
            criterionLabel: c.label,
            currentValue: item?.rawValue ?? 0,
            unit: c.unit,
            direction: c.direction,
            requiredValue: item?.rawValue ?? 0,
            delta: 0,
            feasible: true,
            explanation: 'Already ranked #1.',
          };
        });
        continue;
      }

      const scoreGap = Math.max(0, (rank1.finalScore || 0) - (targetBid.finalScore || 0));

      breakevenByBid[targetBid.bidId] = snapshot.scoringCriteria.map((c) => {
        const weight = c.weight;
        const item = targetBid.breakdown?.find((b) => b.key === c.key);
        const winnerItem = rank1.breakdown?.find((b) => b.key === c.key);

        const currentRaw = item?.rawValue ?? 0;
        const currentNorm = item?.normalizedScore ?? 0;

        if (weight <= 0) {
          return {
            criterionKey: c.key,
            criterionLabel: c.label,
            currentValue: currentRaw,
            unit: c.unit,
            direction: c.direction,
            requiredValue: currentRaw,
            delta: 0,
            feasible: false,
            explanation: 'Weight is 0%; adjusting this criterion has no impact on total score.',
          };
        }

        const neededNormDelta = (scoreGap + 0.0001) / (weight / 100);
        const requiredNorm = currentNorm + neededNormDelta;

        if (requiredNorm > 100) {
          return {
            criterionKey: c.key,
            criterionLabel: c.label,
            currentValue: currentRaw,
            unit: c.unit,
            direction: c.direction,
            requiredValue: currentRaw,
            delta: 0,
            feasible: false,
            explanation: `Requires normalized score of ${requiredNorm.toFixed(1)}/100, which exceeds theoretical maximum (100).`,
          };
        }

        if (c.direction === 'higher') {
          const cohortMax = Math.max(currentRaw, winnerItem?.rawValue ?? 0);
          const requiredRaw = (requiredNorm * cohortMax) / 100;
          const delta = requiredRaw - currentRaw;
          return {
            criterionKey: c.key,
            criterionLabel: c.label,
            currentValue: currentRaw,
            unit: c.unit,
            direction: c.direction,
            requiredValue: requiredRaw,
            delta,
            feasible: true,
            explanation: `Increase by +${delta.toFixed(2)} ${c.unit} (to ${requiredRaw.toFixed(2)} ${c.unit}) to win.`,
          };
        } else {
          const cohortMin = Math.min(currentRaw, winnerItem?.rawValue ?? currentRaw);
          const requiredRaw = (cohortMin * 100) / requiredNorm;
          const delta = currentRaw - requiredRaw;
          const feasible = requiredRaw > 0;
          return {
            criterionKey: c.key,
            criterionLabel: c.label,
            currentValue: currentRaw,
            unit: c.unit,
            direction: c.direction,
            requiredValue: requiredRaw,
            delta: -delta,
            feasible,
            explanation: feasible
              ? `Reduce by -${c.key === 'price' ? `₹${(delta / 100).toLocaleString('en-IN')}` : `${delta.toFixed(2)} ${c.unit}`} (to ${c.key === 'price' ? `₹${(requiredRaw / 100).toLocaleString('en-IN')}` : `${requiredRaw.toFixed(2)} ${c.unit}`}) to win.`
              : 'Mathematically unfeasible under current weight structure.',
          };
        }
      });
    }
  }

  return {
    tenderId: tender._id.toString(),
    tenderCode: tender.tenderCode,
    marginOfVictory,
    rank1Winner: rank1 ? { bidId: rank1.bidId, vendorName: rank1.vendorName || '', score: rank1.finalScore || 0 } : null,
    rank2RunnerUp: rank2 ? { bidId: rank2.bidId, vendorName: rank2.vendorName || '', score: rank2.finalScore || 0 } : null,
    criticalBounds,
    breakevenByBid,
  };
}

/**
 * Generate CSV Report with full Provenance Disclosure (SPEC §14.5, §23)
 */
export async function generateTenderReportCsv(tenderId: string): Promise<string> {
  const { tender, snapshot, bidContexts } = await loadTenderAndBidContexts(tenderId);
  const pureOutput = evaluateTenderPure(bidContexts, snapshot);

  const criteriaKeys = snapshot.scoringCriteria.map((c) => c.key);
  const headerCols = [
    'Tender Code',
    'Rank',
    'Vendor Name',
    'Bid ID',
    'Eligibility Status',
    'Final Composite Score',
    'Disqualification Reason',
  ];

  for (const c of snapshot.scoringCriteria) {
    headerCols.push(
      `${c.label} (Raw)`,
      `${c.label} (Norm)`,
      `${c.label} (Weighted)`,
      `${c.label} (Provenance Source)`,
      `${c.label} (Provenance Status)`
    );
  }

  const rows: string[] = [headerCols.join(',')];

  for (const r of pureOutput.results) {
    const rowCols: string[] = [
      `"${tender.tenderCode}"`,
      r.rank ? `${r.rank}` : 'DISQUALIFIED',
      `"${r.vendorName || ''}"`,
      `"${r.bidId}"`,
      r.eligible ? 'ELIGIBLE' : 'DISQUALIFIED',
      r.finalScore !== undefined ? r.finalScore.toFixed(4) : 'N/A',
      `"${r.failedRules?.map((f) => f.code).join('; ') || 'None'}"`,
    ];

    for (const key of criteriaKeys) {
      const item = r.breakdown?.find((b) => b.key === key);
      if (item) {
        rowCols.push(
          `${item.rawValue}`,
          `${item.normalizedScore.toFixed(2)}`,
          `${item.weightedScore.toFixed(2)}`,
          `"${item.provenance?.source || 'SELF_REPORTED'}"`,
          `"${item.provenance?.verificationStatus || 'UNVERIFIED'}"`
        );
      } else {
        rowCols.push('N/A', 'N/A', 'N/A', 'N/A', 'N/A');
      }
    }

    rows.push(rowCols.join(','));
  }

  return rows.join('\n');
}

/**
 * Dashboard Summary Counts & Metrics
 */
export async function getDashboardSummary() {
  const [totalTenders, activeTenders, evaluatedTenders, closedTenders, totalVendors, totalBids, recentTenders] =
    await Promise.all([
      Tender.countDocuments(),
      Tender.countDocuments({ status: 'BIDDING_OPEN' }),
      Tender.countDocuments({ status: { $in: ['EVALUATED', 'WINNER_SELECTED'] } }),
      Tender.countDocuments({ status: 'CLOSED' }),
      User.countDocuments({ role: 'VENDOR' }),
      Bid.countDocuments({ isLatest: true }),
      Tender.find().sort({ createdAt: -1 }).limit(5).exec(),
    ]);

  return {
    totalTenders,
    activeTenders,
    evaluatedTenders,
    closedTenders,
    totalVendors,
    totalBids,
    recentTenders,
  };
}
