/**
 * Pure Evaluation Pipeline Coordinator (SPEC §12.1)
 *
 * Coordinates the pure evaluation zone:
 * 1. Derives quality scores for all bids
 * 2. Screens eligibility for all bids (returns all failure reasons)
 * 3. Normalizes and scores eligible cohort
 * 4. Applies ranking and tie-break cascade
 * 5. Assembles complete results payload
 *
 * Absolutely no I/O, no DB, no Date.now(), no Math.random().
 */

import {
  BidContext,
  TenderConfigSnapshot,
  RankedResult,
  EvaluationSummary,
} from '@agps/shared';
import { computeDerivedQualityScore } from './qualityEngine.js';
import { evaluateEligibility } from './eligibilityEngine.js';
import { scoreCohort } from './scoringEngine.js';
import { getRankingStrategy } from './ranking/index.js';

export interface PureEvaluationOutput {
  results: RankedResult[];
  summary: EvaluationSummary;
}

export function evaluateTenderPure(
  bids: BidContext[],
  snapshot: TenderConfigSnapshot
): PureEvaluationOutput {
  const totalBids = bids.length;

  // 1. Derive quality score for each bid if technical criteria exist
  const enrichedBids: BidContext[] = bids.map((bid) => {
    const derivedQualityScore = typeof bid.derivedQualityScore === 'number'
      ? bid.derivedQualityScore
      : computeDerivedQualityScore(bid.technicalValues, snapshot.technicalCriteria);
    return {
      ...bid,
      derivedQualityScore,
    };
  });

  // 2. Screen eligibility for each bid
  const eligibleBids: BidContext[] = [];
  const rejectedResults: RankedResult[] = [];

  for (const bid of enrichedBids) {
    const eligibility = evaluateEligibility(bid, snapshot.eligibilityRules || []);
    if (eligibility.eligible) {
      eligibleBids.push(bid);
    } else {
      rejectedResults.push({
        bidId: bid.bidId,
        vendorId: bid.vendorId,
        vendorName: bid.vendorName,
        eligible: false,
        failedRules: eligibility.failedRules,
      });
    }
  }

  // 3. Handle zero-eligible vendors case (SPEC §12.6, Test 12)
  if (eligibleBids.length === 0) {
    return {
      results: rejectedResults,
      summary: {
        totalBids,
        eligibleCount: 0,
        rejectedCount: rejectedResults.length,
        outcome: 'NO_ELIGIBLE_VENDORS',
        winnerBid: null,
        winningScore: null,
      },
    };
  }

  // 4. Score eligible cohort
  const scoredCohort = scoreCohort(
    eligibleBids,
    snapshot.scoringCriteria,
    snapshot.technicalCriteria,
    snapshot.normalizationMethod
  );

  // 5. Rank eligible cohort
  const rankingStrategy = getRankingStrategy(snapshot.rankingMethod);
  const rankedEligible = rankingStrategy.rank(scoredCohort, snapshot.tieBreakOrder);

  // 6. Combine ranked eligible results and rejected results
  const allResults = [...rankedEligible, ...rejectedResults];
  const winner = rankedEligible.length > 0 ? rankedEligible[0] : null;

  return {
    results: allResults,
    summary: {
      totalBids,
      eligibleCount: eligibleBids.length,
      rejectedCount: rejectedResults.length,
      outcome: 'RANKED',
      winnerBid: winner?.bidId ?? null,
      winningScore: winner?.finalScore ?? null,
    },
  };
}
