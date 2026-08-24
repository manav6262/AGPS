/**
 * SAW (Simple Additive Weighting) Ranking Strategy (SPEC §12.5)
 *
 * Implements deterministic ranking and tie-break resolution for scored bids.
 */

import { RankedResult } from '@agps/shared';
import { ScoredBid } from '../scoringEngine.js';
import { compareScoredBids, DEFAULT_TIE_BREAK_ORDER } from '../tieBreak.js';

export interface RankingStrategy {
  readonly key: string;
  rank(scoredCohort: ScoredBid[], tieBreakOrder?: string[]): RankedResult[];
}

export class SawRankingStrategy implements RankingStrategy {
  readonly key = 'SAW';

  rank(scoredCohort: ScoredBid[], tieBreakOrder: string[] = DEFAULT_TIE_BREAK_ORDER): RankedResult[] {
    if (scoredCohort.length === 0) {
      return [];
    }

    // Sort using deterministic tie-break cascade
    const sorted = [...scoredCohort].sort((a, b) => {
      const res = compareScoredBids(a, b, tieBreakOrder);
      return res.comparison;
    });

    const isNonComparative = sorted.length === 1;
    const rankedResults: RankedResult[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      let tieBrokenBy: string | null = null;

      // Check if current was in an exact score tie with its preceding or following neighbor
      if (i > 0) {
        const prev = sorted[i - 1];
        const res = compareScoredBids(prev, current, tieBreakOrder);
        if (res.tieBrokenBy) {
          tieBrokenBy = res.tieBrokenBy;
        }
      } else if (i < sorted.length - 1) {
        const next = sorted[i + 1];
        const res = compareScoredBids(current, next, tieBreakOrder);
        if (res.tieBrokenBy) {
          tieBrokenBy = res.tieBrokenBy;
        }
      }

      rankedResults.push({
        bidId: current.bid.bidId,
        vendorId: current.bid.vendorId,
        vendorName: current.bid.vendorName,
        eligible: true,
        failedRules: [],
        rawValues: current.rawValues,
        breakdown: current.breakdown,
        finalScore: current.finalScore,
        rank: i + 1,
        tieBrokenBy,
        isNonComparative,
      });
    }

    return rankedResults;
  }
}

export const sawRankingStrategy = new SawRankingStrategy();
