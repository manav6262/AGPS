/**
 * Eligibility Engine (SPEC §10)
 *
 * Evaluates ALL enabled rules against a bid context.
 * Returns all failures. Never short-circuits.
 * Pure function: no DB, no I/O, no Date.now(), no randomness.
 */

import {
  BidContext,
  EligibilityRule,
  EligibilityResult,
  FailedRule,
  RuleOperator,
} from '@agps/shared';

function extractFieldVal(context: BidContext, field: string): unknown {
  if (field === 'price') {
    return context.priceMinor;
  }
  if (field === 'deliveryDays') {
    return typeof context.deliveryDays === 'object' && context.deliveryDays !== null
      ? (context.deliveryDays as { value: number }).value
      : context.deliveryDays;
  }
  if (field === 'experienceYears') {
    return context.vendorSnapshot?.experienceYears;
  }
  if (field === 'derivedQualityScore') {
    return context.derivedQualityScore;
  }
  if (field === 'annualTurnover') {
    return context.vendorSnapshot?.annualTurnoverMinor;
  }
  if (field === 'documentCount') {
    return context.documentCount ?? 0;
  }
  if (field === 'vendorBlacklisted') {
    return context.vendorSnapshot?.isBlacklisted ?? context.vendorBlacklisted ?? false;
  }
  if (field === 'qualityVerificationStatus') {
    return context.qualityVerificationStatus ?? 'UNVERIFIED';
  }
  if (field === 'verifiedFieldRatio') {
    return context.verifiedFieldRatio ?? 0;
  }
  if (field.startsWith('technical.')) {
    const techKey = field.slice('technical.'.length);
    const techEntry = context.technicalValues ? context.technicalValues[techKey] : undefined;
    if (techEntry !== null && typeof techEntry === 'object' && 'value' in techEntry) {
      return (techEntry as { value: unknown }).value;
    }
    return techEntry;
  }
  return undefined;
}

function evaluateOperator(operator: RuleOperator, actual: unknown, required: unknown): boolean {
  switch (operator) {
    case 'lt':
      return typeof actual === 'number' && typeof required === 'number' && actual < required;
    case 'lte':
      return typeof actual === 'number' && typeof required === 'number' && actual <= required;
    case 'gt':
      return typeof actual === 'number' && typeof required === 'number' && actual > required;
    case 'gte':
      return typeof actual === 'number' && typeof required === 'number' && actual >= required;
    case 'eq':
      return actual === required;
    case 'neq':
      return actual !== required;
    case 'in':
      return Array.isArray(required) && required.includes(actual as any);
    case 'nin':
      return Array.isArray(required) && !required.includes(actual as any);
    case 'isTrue':
      return actual === true;
    case 'isFalse':
      return actual === false;
    default:
      return false;
  }
}

export function evaluateEligibility(
  context: BidContext,
  rules: EligibilityRule[]
): EligibilityResult {
  const failedRules: FailedRule[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    const actual = extractFieldVal(context, rule.field);
    const passed = evaluateOperator(rule.operator, actual, rule.value);

    if (!passed) {
      failedRules.push({
        code: rule.code,
        message: rule.message,
        field: rule.field,
        operator: rule.operator,
        actualValue: actual,
        requiredValue: rule.value,
      });
    }
  }

  return {
    eligible: failedRules.length === 0,
    failedRules,
  };
}
