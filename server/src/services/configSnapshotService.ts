/**
 * Tender Configuration Snapshot Service (SPEC §6)
 */

import { Types } from 'mongoose';
import {
  TenderConfigSnapshot,
  Constraints,
  EligibilityRule,
  TechnicalCriterion,
  ScoringCriterion,
} from '@agps/shared';
import { hashConfig } from '../utils/hash.js';

export interface CreateSnapshotInput {
  version?: number;
  lockedBy: string | Types.ObjectId;
  engineVersion?: string;
  constraints: Constraints;
  eligibilityRules: EligibilityRule[];
  technicalCriteria?: TechnicalCriterion[];
  scoringCriteria: ScoringCriterion[];
  tieBreakOrder: string[];
}

function toPlain<T>(val: T): T {
  if (val !== null && typeof val === 'object') {
    if (typeof (val as any).toObject === 'function') {
      return (val as any).toObject();
    }
    if (typeof (val as any).toJSON === 'function') {
      return (val as any).toJSON();
    }
    if (Array.isArray(val)) {
      return val.map((item) => toPlain(item)) as unknown as T;
    }
  }
  return val;
}

export function buildTenderConfigSnapshot(
  input: CreateSnapshotInput
): TenderConfigSnapshot {
  const version = input.version ?? 1;
  const lockedAt = new Date();
  const lockedBy = input.lockedBy.toString();
  const engineVersion = input.engineVersion ?? '1.0.0';

  const partialSnapshot: Omit<TenderConfigSnapshot, 'configHash'> = {
    version,
    lockState: 'SOFT_LOCKED',
    lockedAt,
    lockedBy,
    hardLockedAt: null,
    engineVersion,
    rankingMethod: 'SAW',
    normalizationMethod: 'RATIO',
    constraints: toPlain(input.constraints),
    eligibilityRules: toPlain(input.eligibilityRules),
    technicalCriteria: input.technicalCriteria ? toPlain(input.technicalCriteria) : [],
    scoringCriteria: toPlain(input.scoringCriteria),
    tieBreakOrder: toPlain(input.tieBreakOrder),
  };

  const configHash = hashConfig(partialSnapshot);

  return {
    ...partialSnapshot,
    configHash,
  };
}
