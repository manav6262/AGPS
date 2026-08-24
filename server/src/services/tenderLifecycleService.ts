/**
 * Tender Lifecycle & State Transition Service (SPEC §14.1, §14.2)
 */

import { TenderStatus, ITender } from '../models/tender.js';
import { validateScoringCriteria, validateTechnicalCriteria } from '../utils/validation.js';

export const TRANSITIONS: Record<TenderStatus, TenderStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['BIDDING_OPEN', 'CANCELLED'],
  BIDDING_OPEN: ['BIDDING_CLOSED', 'CANCELLED'],
  BIDDING_CLOSED: ['FINANCIAL_OPEN', 'CANCELLED'],
  FINANCIAL_OPEN: ['UNDER_EVALUATION', 'CANCELLED'],
  UNDER_EVALUATION: ['EVALUATED', 'FAILED'],
  EVALUATED: ['WINNER_SELECTED', 'UNDER_EVALUATION', 'CANCELLED'],
  WINNER_SELECTED: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
  FAILED: [],
};

export function canTransition(currentStatus: TenderStatus, targetStatus: TenderStatus): boolean {
  const allowed = TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.includes(targetStatus));
}

export function validateTenderForPublish(tender: ITender): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Scoring criteria validation (SPEC §7.5)
  const scoringVal = validateScoringCriteria(tender.scoringCriteria, tender.technicalCriteria);
  if (!scoringVal.valid) {
    errors.push(...scoringVal.errors);
  }

  // 2. Technical criteria validation (SPEC §8.4)
  if (tender.technicalCriteria && tender.technicalCriteria.length > 0) {
    const techVal = validateTechnicalCriteria(tender.technicalCriteria);
    if (!techVal.valid) {
      errors.push(...techVal.errors);
    }
  }

  // 3. Constraints validation
  if (!tender.constraints) {
    errors.push('Tender constraints are required');
  } else {
    if (tender.constraints.maxBudgetMinor <= 0) {
      errors.push('maxBudgetMinor must be a positive integer');
    }
    if (tender.constraints.minQualityScore < 0 || tender.constraints.minQualityScore > 100) {
      errors.push('minQualityScore must be between 0 and 100');
    }
    if (tender.constraints.maxDeliveryDays < 1) {
      errors.push('maxDeliveryDays must be at least 1 day');
    }
    if (tender.constraints.minExperienceYears < 0) {
      errors.push('minExperienceYears must be >= 0');
    }
  }

  // 4. Dates validation
  const now = new Date();
  if (new Date(tender.deadlineAt) <= now) {
    errors.push('deadlineAt must be in the future');
  }
  if (new Date(tender.deadlineAt) <= new Date(tender.startAt)) {
    errors.push('deadlineAt must be after startAt');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
