/**
 * Scoring Engine (SPEC §11.3)
 *
 * Computes normalized scores and weighted scores per criterion in the exact
 * frozen array order of scoringCriteria.
 * Full float64 precision is maintained.
 */

import {
  BidContext,
  ScoringCriterion,
  TechnicalCriterion,
  ScoreBreakdownItem,
  Provenance,
} from '@agps/shared';
import { resolveCriterionValue } from './criterionResolver.js';
import { getNormalizationStrategy } from './normalization/index.js';

export interface ScoredBid {
  bid: BidContext;
  rawValues: Record<string, { value: number; unit: string; provenance?: Provenance }>;
  breakdown: ScoreBreakdownItem[];
  finalScore: number;
}

export function scoreCohort(
  eligibleBids: BidContext[],
  scoringCriteria: ScoringCriterion[],
  technicalCriteria: TechnicalCriterion[] = [],
  normalizationMethod: string = 'RATIO'
): ScoredBid[] {
  if (eligibleBids.length === 0) {
    return [];
  }

  const strategy = getNormalizationStrategy(normalizationMethod);

  // Initialize accumulators for each eligible bid
  const scoredMap = new Map<string, {
    bid: BidContext;
    rawValues: Record<string, { value: number; unit: string; provenance?: Provenance }>;
    breakdown: ScoreBreakdownItem[];
    finalScore: number;
  }>();

  for (const bid of eligibleBids) {
    scoredMap.set(bid.bidId, {
      bid,
      rawValues: {},
      breakdown: [],
      finalScore: 0,
    });
  }

  // Iterate over scoringCriteria in their declared array order (SPEC §11.3, Invariant 6)
  for (const criterion of scoringCriteria) {
    // 1. Resolve raw values for all bids in cohort
    const rawValuesByBid = new Map<string, number>();
    const cohortValues: number[] = [];

    for (const bid of eligibleBids) {
      const rawVal = resolveCriterionValue(criterion, bid, technicalCriteria);
      rawValuesByBid.set(bid.bidId, rawVal);
      cohortValues.push(rawVal);
    }

    // 2. Normalize and compute weighted score for each bid
    for (const bid of eligibleBids) {
      const rawVal = rawValuesByBid.get(bid.bidId)!;
      const normalized = strategy.normalize(rawVal, cohortValues, criterion.direction);
      const weighted = (normalized * criterion.weight) / 100;

      // Extract provenance if available
      let fieldProvenance: Provenance | undefined;
      if (criterion.valueSource.type === 'TECHNICAL_VALUE') {
        const entry = bid.technicalValues?.[criterion.valueSource.path];
        if (entry && typeof entry === 'object' && 'provenance' in entry) {
          fieldProvenance = entry.provenance;
        }
      } else if (criterion.valueSource.type === 'BID_FIELD') {
        if (criterion.valueSource.path === 'deliveryDays' && typeof bid.deliveryDays === 'object' && bid.deliveryDays !== null) {
          fieldProvenance = (bid.deliveryDays as any).provenance;
        }
      } else if (criterion.valueSource.type === 'VENDOR_FIELD') {
        fieldProvenance = bid.vendorSnapshot?.provenance;
      }

      const scoreEntry = scoredMap.get(bid.bidId)!;
      scoreEntry.rawValues[criterion.key] = {
        value: rawVal,
        unit: criterion.unit,
        provenance: fieldProvenance,
      };

      scoreEntry.breakdown.push({
        key: criterion.key,
        label: criterion.label,
        rawValue: rawVal,
        unit: criterion.unit,
        normalizedScore: normalized,
        weight: criterion.weight,
        weightedScore: weighted,
        provenance: fieldProvenance,
      });

      // Sum weighted scores in fixed criterion order
      scoreEntry.finalScore += weighted;
    }
  }

  return eligibleBids.map((b) => scoredMap.get(b.bidId)!);
}
