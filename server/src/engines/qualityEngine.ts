/**
 * Quality derivation engine (SPEC §9)
 *
 * Computes deterministic derivedQualityScore from declared technical claims.
 * Inputs are vendor-declared and unverified.
 */

import { TechnicalCriterion, BidContext } from '@agps/shared';

function extractRawValue(val: unknown): unknown {
  if (val !== null && typeof val === 'object' && 'value' in val) {
    return (val as { value: unknown }).value;
  }
  return val;
}

export function computeDerivedQualityScore(
  technicalValues: Record<string, unknown> | undefined,
  technicalCriteria: TechnicalCriterion[]
): number {
  if (!technicalCriteria || technicalCriteria.length === 0) {
    return 0;
  }

  let totalEarned = 0;

  for (const criterion of technicalCriteria) {
    const rawEntry = technicalValues ? technicalValues[criterion.key] : undefined;
    const rawVal = extractRawValue(rawEntry);
    let earned = 0;

    switch (criterion.type) {
      case 'boolean': {
        earned = rawVal === true ? criterion.points : 0;
        break;
      }
      case 'numeric': {
        const numVal = Number(rawVal);
        if (isNaN(numVal)) {
          earned = 0;
        } else if (criterion.max === criterion.min) {
          earned = criterion.direction === 'higher'
            ? (numVal >= criterion.min ? criterion.points : 0)
            : (numVal <= criterion.max ? criterion.points : 0);
        } else {
          const t = (numVal - criterion.min) / (criterion.max - criterion.min);
          const clampedT = Math.max(0, Math.min(1, t));
          earned = criterion.points * (criterion.direction === 'higher' ? clampedT : 1 - clampedT);
        }
        break;
      }
      case 'enum': {
        const option = criterion.options.find((o) => o.value === rawVal);
        const fraction = option ? option.fraction : 0;
        earned = criterion.points * Math.max(0, Math.min(1, fraction));
        break;
      }
      case 'checklist': {
        let tickedFractionsSum = 0;
        if (Array.isArray(rawVal)) {
          for (const item of criterion.items) {
            if (rawVal.includes(item.key)) {
              tickedFractionsSum += item.fraction;
            }
          }
        } else if (rawVal !== null && typeof rawVal === 'object') {
          for (const item of criterion.items) {
            if ((rawVal as Record<string, boolean>)[item.key] === true) {
              tickedFractionsSum += item.fraction;
            }
          }
        }
        earned = criterion.points * Math.max(0, Math.min(1, tickedFractionsSum));
        break;
      }
    }

    totalEarned += earned;
  }

  return Math.max(0, Math.min(100, totalEarned));
}

export function evaluateBidQuality(
  bid: BidContext,
  technicalCriteria: TechnicalCriterion[]
): number {
  return computeDerivedQualityScore(bid.technicalValues, technicalCriteria);
}
