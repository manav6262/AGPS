/**
 * Criterion Resolver (SPEC §7.3)
 *
 * Maps a ScoringCriterion to a numeric value for a given BidContext.
 * Coerces technical claims to a [0, 100] scale according to their declared type.
 */

import {
  ScoringCriterion,
  BidContext,
  TechnicalCriterion,
} from '@agps/shared';
import { computeDerivedQualityScore } from './qualityEngine.js';

function extractRawValue(val: unknown): unknown {
  if (val !== null && typeof val === 'object' && 'value' in val) {
    return (val as { value: unknown }).value;
  }
  return val;
}

export function resolveCriterionValue(
  criterion: ScoringCriterion,
  context: BidContext,
  technicalCriteria?: TechnicalCriterion[]
): number {
  const vs = criterion.valueSource;

  switch (vs.type) {
    case 'BID_FIELD': {
      if (vs.path === 'priceMinor') {
        return context.priceMinor;
      }
      if (vs.path === 'deliveryDays') {
        const days = typeof context.deliveryDays === 'object' && context.deliveryDays !== null
          ? (context.deliveryDays as { value: number }).value
          : context.deliveryDays;
        return Number(days);
      }
      throw new Error(`Unrecognized BID_FIELD path: ${(vs as any).path}`);
    }

    case 'VENDOR_FIELD': {
      if (vs.path === 'experienceYears') {
        return Number(context.vendorSnapshot?.experienceYears ?? 0);
      }
      if (vs.path === 'annualTurnoverMinor') {
        return Number(context.vendorSnapshot?.annualTurnoverMinor ?? 0);
      }
      throw new Error(`Unrecognized VENDOR_FIELD path: ${(vs as any).path}`);
    }

    case 'DERIVED_QUALITY': {
      if (typeof context.derivedQualityScore === 'number') {
        return context.derivedQualityScore;
      }
      return computeDerivedQualityScore(context.technicalValues, technicalCriteria || []);
    }

    case 'TECHNICAL_VALUE': {
      const techKey = vs.path;
      const rawEntry = context.technicalValues ? context.technicalValues[techKey] : undefined;
      const rawVal = extractRawValue(rawEntry);
      const techDef = technicalCriteria?.find((t) => t.key === techKey);

      if (!techDef) {
        if (typeof rawVal === 'boolean') {
          return rawVal ? 100 : 0;
        }
        const num = Number(rawVal);
        return isNaN(num) ? 0 : num;
      }

      switch (techDef.type) {
        case 'boolean':
          return rawVal === true ? 100 : 0;
        case 'numeric': {
          const num = Number(rawVal);
          return isNaN(num) ? 0 : num;
        }
        case 'enum': {
          const option = techDef.options.find((o) => o.value === rawVal);
          const fraction = option ? option.fraction : 0;
          return fraction * 100;
        }
        case 'checklist': {
          let tickedFractionsSum = 0;
          if (Array.isArray(rawVal)) {
            for (const item of techDef.items) {
              if (rawVal.includes(item.key)) {
                tickedFractionsSum += item.fraction;
              }
            }
          } else if (rawVal !== null && typeof rawVal === 'object') {
            for (const item of techDef.items) {
              if ((rawVal as Record<string, boolean>)[item.key] === true) {
                tickedFractionsSum += item.fraction;
              }
            }
          }
          return Math.max(0, Math.min(1, tickedFractionsSum)) * 100;
        }
      }
    }
  }

  throw new Error(`Invalid valueSource type: ${(vs as any).type}`);
}
