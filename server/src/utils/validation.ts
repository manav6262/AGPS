/**
 * Scoring Criteria and Technical Criteria Validation (SPEC §7.3, §7.5, §22 Tests 6, 15, 19, 20)
 */

import { ScoringCriterion, TechnicalCriterion } from '@agps/shared';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateScoringCriteria(
  criteria: ScoringCriterion[],
  technicalCriteria?: TechnicalCriterion[]
): ValidationResult {
  const errors: string[] = [];

  // Criteria count bounded at 2 <= count <= 10 (SPEC §7.5, Test 20)
  if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10) {
    errors.push(`Criteria count must be between 2 and 10, got ${criteria?.length ?? 0}`);
  }

  let totalWeight = 0;
  const knownKeys = new Set<string>();
  const technicalKeys = new Set((technicalCriteria || []).map((t) => t.key));

  for (const c of criteria || []) {
    // Unique key check
    if (knownKeys.has(c.key)) {
      errors.push(`Duplicate scoring criterion key: '${c.key}'`);
    }
    knownKeys.add(c.key);

    // Direction check
    if (c.direction !== 'lower' && c.direction !== 'higher') {
      errors.push(`Criterion '${c.key}' has invalid direction: '${c.direction}'. Must be 'lower' or 'higher'.`);
    }

    // Weight must be an integer (SPEC §7.5, Invariant 7, Test 15)
    if (typeof c.weight !== 'number' || !Number.isInteger(c.weight) || c.weight <= 0) {
      errors.push(`Criterion '${c.key}' weight must be a positive integer, got ${c.weight}`);
    } else {
      totalWeight += c.weight;
    }

    // Whitelisted valueSource paths (SPEC §7.3, Test 19)
    if (!c.valueSource || typeof c.valueSource !== 'object') {
      errors.push(`Criterion '${c.key}' is missing a valid valueSource`);
    } else {
      const vs = c.valueSource;
      switch (vs.type) {
        case 'BID_FIELD': {
          const allowedBidPaths = ['priceMinor', 'deliveryDays'];
          if (!allowedBidPaths.includes(vs.path)) {
            errors.push(`Criterion '${c.key}' has unwhitelisted BID_FIELD path: '${vs.path}'`);
          }
          break;
        }
        case 'VENDOR_FIELD': {
          const allowedVendorPaths = ['experienceYears', 'annualTurnoverMinor'];
          if (!allowedVendorPaths.includes(vs.path)) {
            errors.push(`Criterion '${c.key}' has unwhitelisted VENDOR_FIELD path: '${vs.path}'`);
          }
          break;
        }
        case 'TECHNICAL_VALUE': {
          if (!vs.path || typeof vs.path !== 'string') {
            errors.push(`Criterion '${c.key}' TECHNICAL_VALUE requires a valid path string`);
          } else if (technicalCriteria && technicalCriteria.length > 0 && !technicalKeys.has(vs.path)) {
            errors.push(`Criterion '${c.key}' references undeclared technical criterion: '${vs.path}'`);
          }
          break;
        }
        case 'DERIVED_QUALITY':
          // Valid with no path
          break;
        default:
          errors.push(`Criterion '${c.key}' has invalid valueSource type: '${(vs as any).type}'`);
      }
    }
  }

  // All weights must sum to exactly 100 (SPEC §7.5, Invariant 7, Test 6)
  if (totalWeight !== 100) {
    errors.push(`Scoring criteria weights must sum to exactly 100, got ${totalWeight}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateTechnicalCriteria(criteria: TechnicalCriterion[]): ValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(criteria)) {
    return { valid: false, errors: ['Technical criteria must be an array'] };
  }

  let totalPoints = 0;
  const knownKeys = new Set<string>();

  for (const tc of criteria) {
    if (knownKeys.has(tc.key)) {
      errors.push(`Duplicate technical criterion key: '${tc.key}'`);
    }
    knownKeys.add(tc.key);

    if (typeof tc.points !== 'number' || !Number.isInteger(tc.points) || tc.points <= 0) {
      errors.push(`Technical criterion '${tc.key}' points must be a positive integer, got ${tc.points}`);
    } else {
      totalPoints += tc.points;
    }

    switch (tc.type) {
      case 'numeric':
        if (typeof tc.min !== 'number' || typeof tc.max !== 'number' || tc.max < tc.min) {
          errors.push(`Numeric criterion '${tc.key}' has invalid min/max (${tc.min}, ${tc.max})`);
        }
        if (tc.direction !== 'lower' && tc.direction !== 'higher') {
          errors.push(`Numeric criterion '${tc.key}' has invalid direction: '${tc.direction}'`);
        }
        break;
      case 'boolean':
        break;
      case 'enum':
        if (!Array.isArray(tc.options) || tc.options.length === 0) {
          errors.push(`Enum criterion '${tc.key}' must have non-empty options`);
        }
        break;
      case 'checklist':
        if (!Array.isArray(tc.items) || tc.items.length === 0) {
          errors.push(`Checklist criterion '${tc.key}' must have non-empty items`);
        }
        break;
      default:
        errors.push(`Technical criterion '${(tc as any).key}' has unknown type: '${(tc as any).type}'`);
    }
  }

  if (criteria.length > 0 && totalPoints !== 100) {
    errors.push(`Technical criteria points must sum to exactly 100, got ${totalPoints}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
