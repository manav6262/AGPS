/**
 * Tender Configuration Snapshot and Locking (SPEC §6.3)
 */

import { EligibilityRule } from './rules.js';
import { ScoringCriterion, TechnicalCriterion } from './criteria.js';

export type ConfigLockState = 'UNLOCKED' | 'SOFT_LOCKED' | 'HARD_LOCKED';

export interface Constraints {
  maxBudgetMinor: number;
  minQualityScore: number;
  maxDeliveryDays: number;
  minExperienceYears: number;
}

export interface TenderConfigSnapshot {
  version: number;              // 1 at publish; +1 per SOFT_LOCKED revision
  lockState: 'SOFT_LOCKED' | 'HARD_LOCKED';
  lockedAt: string | Date;      // when THIS version was written
  lockedBy: string;             // user id
  hardLockedAt: string | Date | null; // set once, when the first bid arrives
  engineVersion: string;        // e.g. "1.0.0"

  rankingMethod: 'SAW';         // §12.5 — one value in this build
  normalizationMethod: 'RATIO'; // 'MINMAX' deferred, §11.1

  constraints: Constraints;
  eligibilityRules: EligibilityRule[];
  technicalCriteria: TechnicalCriterion[];
  scoringCriteria: ScoringCriterion[];
  tieBreakOrder: string[];

  configHash: string;           // sha256 over key-sorted canonical JSON, §13.2
}
