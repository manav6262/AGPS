/**
 * Tie-Breaking Cascade Engine (SPEC §11.4, Invariant 12)
 *
 * Deterministic six-level cascade:
 * 1. finalScore          DESC (higher wins)
 * 2. price               ASC  (cheaper wins)
 * 3. derivedQualityScore DESC (higher wins)
 * 4. deliveryDays        ASC  (faster wins)
 * 5. submittedAt         ASC  (earlier wins)
 * 6. bidId               ASC  (lexicographical total order)
 */

import { ScoredBid } from './scoringEngine.js';

export const DEFAULT_TIE_BREAK_ORDER = [
  'finalScore',
  'price',
  'derivedQualityScore',
  'deliveryDays',
  'submittedAt',
  'bidId',
];

const EPSILON = 1e-9;

function getDeliveryDays(bid: ScoredBid['bid']): number {
  if (typeof bid.deliveryDays === 'object' && bid.deliveryDays !== null) {
    return Number((bid.deliveryDays as { value: number }).value);
  }
  return Number(bid.deliveryDays);
}

export interface TieBreakComparisonResult {
  comparison: number; // < 0 if a comes first, > 0 if b comes first
  tieBrokenBy: string | null; // null if scores differ, or criterion name that broke tie
}

export function compareScoredBids(
  a: ScoredBid,
  b: ScoredBid,
  tieBreakOrder: string[] = DEFAULT_TIE_BREAK_ORDER
): TieBreakComparisonResult {
  // Level 1: finalScore DESC
  const scoreDiff = b.finalScore - a.finalScore;
  if (Math.abs(scoreDiff) > EPSILON) {
    return {
      comparison: scoreDiff,
      tieBrokenBy: null,
    };
  }

  // Scores are equal -> evaluate cascade
  for (const criterion of tieBreakOrder) {
    switch (criterion) {
      case 'finalScore':
        // Already checked
        break;

      case 'price': {
        const priceA = a.bid.priceMinor;
        const priceB = b.bid.priceMinor;
        if (priceA !== priceB) {
          return {
            comparison: priceA - priceB, // Lower price wins
            tieBrokenBy: 'price',
          };
        }
        break;
      }

      case 'derivedQualityScore': {
        const qA = a.bid.derivedQualityScore ?? 0;
        const qB = b.bid.derivedQualityScore ?? 0;
        if (Math.abs(qB - qA) > EPSILON) {
          return {
            comparison: qB - qA, // Higher quality wins
            tieBrokenBy: 'derivedQualityScore',
          };
        }
        break;
      }

      case 'deliveryDays': {
        const dA = getDeliveryDays(a.bid);
        const dB = getDeliveryDays(b.bid);
        if (dA !== dB) {
          return {
            comparison: dA - dB, // Fewer delivery days wins
            tieBrokenBy: 'deliveryDays',
          };
        }
        break;
      }

      case 'submittedAt': {
        const tA = new Date(a.bid.submittedAt).getTime();
        const tB = new Date(b.bid.submittedAt).getTime();
        if (tA !== tB) {
          return {
            comparison: tA - tB, // Earlier submission wins
            tieBrokenBy: 'submittedAt',
          };
        }
        break;
      }

      case 'bidId': {
        const comp = a.bid.bidId < b.bid.bidId ? -1 : a.bid.bidId > b.bid.bidId ? 1 : 0;
        if (comp !== 0) {
          return {
            comparison: comp, // Code-unit lexicographical comparison (deterministic total order)
            tieBrokenBy: 'bidId',
          };
        }
        break;
      }
    }
  }

  // Fallback deterministic code-unit total order
  const finalComp = a.bid.bidId < b.bid.bidId ? -1 : a.bid.bidId > b.bid.bidId ? 1 : 0;
  return {
    comparison: finalComp,
    tieBrokenBy: 'bidId',
  };
}
