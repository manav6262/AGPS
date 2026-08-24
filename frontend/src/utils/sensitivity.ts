/**
 * Pure Mathematical Sensitivity & Breakeven Calculator (SPEC §18, §21)
 *
 * Implements client-side SAW re-scoring, weight elasticity, critical bounds,
 * and breakeven delta analysis over evaluated cohorts.
 */

import { ScoringCriterion, RankedResult } from '@agps/shared';

export interface SimulatedBidScore {
  bidId: string;
  vendorName: string;
  originalRank: number;
  originalScore: number;
  simulatedScore: number;
  simulatedRank: number;
  rankDelta: number; // e.g. +1, -1, 0
  breakdown: Record<string, { rawValue: number; normalizedScore: number; weightedScore: number }>;
}

export interface BreakevenRequirement {
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

export interface CriticalWeightBound {
  criterionKey: string;
  criterionLabel: string;
  currentWeight: number;
  switchThresholdWeight: number | null; // The weight % where the current winner changes
  newWinnerAtThreshold: string | null;
  stabilityMargin: number; // % weight change before winner flips
}

/**
 * Re-scores an eligible cohort using simulated weights (SAW ratio normalization)
 */
export function simulateSawScoring(
  results: RankedResult[],
  criteria: ScoringCriterion[],
  simulatedWeights: Record<string, number>
): SimulatedBidScore[] {
  const eligible = results.filter((r) => r.eligible && r.breakdown);
  if (eligible.length === 0) return [];

  // Compute simulated composite scores
  const scored = eligible.map((r) => {
    let totalScore = 0;
    const breakdown: Record<string, { rawValue: number; normalizedScore: number; weightedScore: number }> = {};

    for (const c of criteria) {
      const item = r.breakdown?.find((b) => b.key === c.key);
      const norm = item?.normalizedScore ?? 0;
      const weight = simulatedWeights[c.key] ?? c.weight;
      const weighted = (norm * weight) / 100;

      totalScore += weighted;
      breakdown[c.key] = {
        rawValue: item?.rawValue ?? 0,
        normalizedScore: norm,
        weightedScore: weighted,
      };
    }

    return {
      bidId: r.bidId,
      vendorName: r.vendorName || r.bidId,
      originalRank: r.rank || 0,
      originalScore: r.finalScore || 0,
      simulatedScore: totalScore,
      breakdown,
    };
  });

  // Sort descending by simulated score (with tiebreak fallback)
  scored.sort((a, b) => {
    if (Math.abs(b.simulatedScore - a.simulatedScore) > 1e-6) {
      return b.simulatedScore - a.simulatedScore;
    }
    return a.bidId.localeCompare(b.bidId);
  });

  // Assign simulated ranks and rank deltas
  return scored.map((item, idx) => {
    const simulatedRank = idx + 1;
    const rankDelta = item.originalRank - simulatedRank; // positive = moved up, negative = dropped
    return {
      ...item,
      simulatedRank,
      rankDelta,
    };
  });
}

/**
 * Calculates the exact single-criterion improvement required for targetBid to overtake the winner
 */
export function calculateBreakevenRequirements(
  targetBid: RankedResult,
  winnerBid: RankedResult,
  criteria: ScoringCriterion[],
  activeWeights: Record<string, number>
): BreakevenRequirement[] {
  if (!targetBid.eligible || !winnerBid.eligible || !targetBid.breakdown || !winnerBid.breakdown) {
    return [];
  }

  const winnerScore = winnerBid.finalScore || 0;
  const targetScore = targetBid.finalScore || 0;
  const scoreGap = Math.max(0, winnerScore - targetScore);

  if (scoreGap <= 1e-6) {
    // Target is already winner
    return criteria.map((c) => {
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
  }

  return criteria.map((c) => {
    const weight = activeWeights[c.key] ?? c.weight;
    const item = targetBid.breakdown?.find((b) => b.key === c.key);
    const winnerItem = winnerBid.breakdown?.find((b) => b.key === c.key);

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

    // Required normalized score increase: Delta Norm = (Score Gap) / (Weight / 100)
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
        explanation: `Requires normalized score of ${requiredNorm.toFixed(1)}/100, which exceeds the theoretical maximum (100).`,
      };
    }

    if (c.direction === 'higher') {
      // For higher: Norm(x) = (x / max) * 100 => x = (Norm * max) / 100
      // Assuming target becomes the new max or cohort max remains:
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
      // For lower: Norm(x) = (min / x) * 100 => x = (min * 100) / Norm
      const cohortMin = Math.min(currentRaw, winnerItem?.rawValue ?? currentRaw);
      const requiredRaw = (cohortMin * 100) / requiredNorm;
      const delta = currentRaw - requiredRaw; // Reduction amount

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

/**
 * Calculates stability bounds for each criterion (the weight range where Rank 1 remains constant)
 */
export function calculateWeightCriticalBounds(
  results: RankedResult[],
  criteria: ScoringCriterion[]
): CriticalWeightBound[] {
  const eligible = results.filter((r) => r.eligible && r.breakdown);
  if (eligible.length < 2) return [];

  const originalWinner = results.find((r) => r.rank === 1)?.vendorName || '';

  return criteria.map((targetCriterion) => {
    const currentWeight = targetCriterion.weight;
    let thresholdWeight: number | null = null;
    let newWinnerName: string | null = null;

    // Scan weights from 0 to 100 in 1% steps
    for (let testW = 0; testW <= 100; testW += 1) {
      const remainingTotal = 100 - testW;
      const otherCriteria = criteria.filter((c) => c.key !== targetCriterion.key);
      const sumOtherOriginalWeights = otherCriteria.reduce((acc, c) => acc + c.weight, 0) || 1;

      const simWeights: Record<string, number> = { [targetCriterion.key]: testW };
      for (const other of otherCriteria) {
        simWeights[other.key] = (other.weight / sumOtherOriginalWeights) * remainingTotal;
      }

      const simResults = simulateSawScoring(results, criteria, simWeights);
      const simWinner = simResults[0]?.vendorName;

      if (simWinner && simWinner !== originalWinner && thresholdWeight === null) {
        thresholdWeight = testW;
        newWinnerName = simWinner;
      }
    }

    const stabilityMargin = thresholdWeight !== null ? Math.abs(thresholdWeight - currentWeight) : 100;

    return {
      criterionKey: targetCriterion.key,
      criterionLabel: targetCriterion.label,
      currentWeight,
      switchThresholdWeight: thresholdWeight,
      newWinnerAtThreshold: newWinnerName,
      stabilityMargin,
    };
  });
}
