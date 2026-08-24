/**
 * Tender Service with Graduated Lock and Atomic Hard-Lock Guards (SPEC §6, §14)
 */

import { Types } from 'mongoose';
import { Tender, ITender } from '../models/tender.js';
import { canTransition, validateTenderForPublish } from './tenderLifecycleService.js';
import { buildTenderConfigSnapshot } from './configSnapshotService.js';
import { createAuditEvent } from './auditService.js';
import { validateScoringCriteria } from '../utils/validation.js';

export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(`${code}: ${message}`);
    this.status = status;
    this.code = code;
  }
}

export async function createTender(input: any, adminId: string | Types.ObjectId): Promise<ITender> {
  const tender = new Tender({
    ...input,
    createdBy: new Types.ObjectId(adminId),
    status: 'DRAFT',
    configLockState: 'UNLOCKED',
    lockedConfig: null,
    configHistory: [],
    firstBidAt: null,
  });

  await tender.save();

  await createAuditEvent({
    tenderId: tender._id,
    actorId: adminId,
    actorRole: 'ADMIN',
    action: 'TENDER_CREATED',
    description: `Tender draft created: ${tender.tenderCode}`,
    payload: { tenderCode: tender.tenderCode, title: tender.title },
  });

  return tender;
}

export async function transitionTender(
  tenderId: string | Types.ObjectId,
  targetStatus: any,
  adminId: string | Types.ObjectId
): Promise<ITender> {
  const tender = await Tender.findById(tenderId);
  if (!tender) {
    throw new AppError(404, 'NOT_FOUND', 'Tender not found');
  }

  if (!canTransition(tender.status, targetStatus)) {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Illegal transition from '${tender.status}' to '${targetStatus}'`
    );
  }

  // 1. Publishing transition (DRAFT -> PUBLISHED)
  if (targetStatus === 'PUBLISHED') {
    const val = validateTenderForPublish(tender);
    if (!val.valid) {
      throw new AppError(400, 'PUBLISH_VALIDATION_FAILED', val.errors.join('; '));
    }

    const snapshotV1 = buildTenderConfigSnapshot({
      version: 1,
      lockedBy: adminId,
      constraints: tender.constraints,
      eligibilityRules: tender.eligibilityRules,
      technicalCriteria: tender.technicalCriteria,
      scoringCriteria: tender.scoringCriteria,
      tieBreakOrder: tender.tieBreakOrder,
    });

    tender.status = 'PUBLISHED';
    tender.configLockState = 'SOFT_LOCKED';
    tender.lockedConfig = snapshotV1;
    tender.configHistory = [snapshotV1];
    await tender.save();

    await createAuditEvent({
      tenderId: tender._id,
      actorId: adminId,
      actorRole: 'ADMIN',
      action: 'TENDER_PUBLISHED',
      description: `Tender published with config version 1 (hash: ${snapshotV1.configHash})`,
      payload: { configVersion: 1, configHash: snapshotV1.configHash },
    });

    return tender;
  }

  // Other lifecycle transitions
  tender.status = targetStatus;
  await tender.save();

  let auditAction: any = null;
  if (targetStatus === 'BIDDING_OPEN') auditAction = 'BIDDING_OPENED';
  else if (targetStatus === 'BIDDING_CLOSED') auditAction = 'BIDDING_CLOSED';
  else if (targetStatus === 'FINANCIAL_OPEN') auditAction = 'FINANCIAL_BIDS_OPENED';
  else if (targetStatus === 'CANCELLED') auditAction = 'TENDER_CANCELLED';
  else if (targetStatus === 'FAILED') auditAction = 'TENDER_FAILED';
  else if (targetStatus === 'CLOSED') auditAction = 'TENDER_CLOSED';

  if (auditAction) {
    await createAuditEvent({
      tenderId: tender._id,
      actorId: adminId,
      actorRole: 'ADMIN',
      action: auditAction,
      description: `Tender status transitioned to ${targetStatus}`,
      payload: { status: targetStatus },
    });
  }

  return tender;
}

export async function updateTender(
  tenderId: string | Types.ObjectId,
  updates: any,
  adminId: string | Types.ObjectId
): Promise<ITender> {
  const tender = await Tender.findById(tenderId);
  if (!tender) {
    throw new AppError(404, 'NOT_FOUND', 'Tender not found');
  }

  // tenderCode is NEVER editable after DRAFT (SPEC §6.2, Test 22c)
  if (updates.tenderCode && updates.tenderCode !== tender.tenderCode && tender.status !== 'DRAFT') {
    throw new AppError(409, 'IMMUTABLE_FIELD', 'tenderCode cannot be modified after DRAFT state');
  }

  // State 1: UNLOCKED (DRAFT) -> fully editable
  if (tender.configLockState === 'UNLOCKED' || tender.status === 'DRAFT') {
    Object.assign(tender, updates);
    await tender.save();
    return tender;
  }

  // State 3: HARD_LOCKED -> immutable evaluation config (SPEC §6.1, Test 22b)
  if (tender.configLockState === 'HARD_LOCKED' || tender.firstBidAt !== null) {
    throw new AppError(
      409,
      'CONFIG_HARD_LOCKED',
      'Evaluation configuration is permanently locked because bids exist'
    );
  }

  // State 2: SOFT_LOCKED -> atomic update with firstBidAt: null filter (SPEC §6.4, Test 24c)
  const nextVersion = (tender.configHistory?.length ?? 0) + 1;
  const mergedConstraints = updates.constraints ?? tender.constraints;
  const mergedEligibility = updates.eligibilityRules ?? tender.eligibilityRules;
  const mergedTechnical = updates.technicalCriteria ?? tender.technicalCriteria;
  const mergedScoring = updates.scoringCriteria ?? tender.scoringCriteria;
  const mergedTieBreak = updates.tieBreakOrder ?? tender.tieBreakOrder;

  // Validate new scoring criteria if modified
  const scoringVal = validateScoringCriteria(mergedScoring, mergedTechnical);
  if (!scoringVal.valid) {
    throw new AppError(400, 'VALIDATION_ERROR', scoringVal.errors.join('; '));
  }

  const newSnapshot = buildTenderConfigSnapshot({
    version: nextVersion,
    lockedBy: adminId,
    constraints: mergedConstraints,
    eligibilityRules: mergedEligibility,
    technicalCriteria: mergedTechnical,
    scoringCriteria: mergedScoring,
    tieBreakOrder: mergedTieBreak,
  });

  const updatePayload: Record<string, any> = {
    ...updates,
    lockedConfig: newSnapshot,
  };

  // Atomic guard in query filter: succeeds ONLY if no bid has landed!
  const updated = await Tender.findOneAndUpdate(
    {
      _id: tender._id,
      firstBidAt: null,
      status: { $in: ['PUBLISHED', 'BIDDING_OPEN'] },
    },
    {
      $set: updatePayload,
      $push: { configHistory: newSnapshot },
    },
    { returnDocument: 'after' }
  ).exec();

  if (!updated) {
    throw new AppError(
      409,
      'CONFIG_HARD_LOCKED',
      'Atomic lock collision: A bid was submitted while editing configuration'
    );
  }

  // Audit event for soft-lock config revision (SPEC §6.2, Test 21b)
  await createAuditEvent({
    tenderId: tender._id,
    actorId: adminId,
    actorRole: 'ADMIN',
    action: 'TENDER_CONFIG_REVISED',
    description: `Tender configuration revised to version ${nextVersion} (hash: ${newSnapshot.configHash})`,
    payload: {
      version: nextVersion,
      configHash: newSnapshot.configHash,
      scoringCriteria: mergedScoring,
    },
  });

  return updated;
}
