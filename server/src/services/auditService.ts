/**
 * Audit Log Service and Chain Verification (SPEC §16)
 */

import { Types } from 'mongoose';
import {
  AuditLog,
  AuditAction,
  IAuditLog,
  GENESIS_PREV_HASH,
  computeAuditHash,
} from '../models/auditLog.js';

export interface AuditVerificationResult {
  valid: boolean;
  totalEntries: number;
  brokenSeq?: number;
  reason?: string;
}

export interface CreateAuditEventParams {
  tenderId: string | Types.ObjectId;
  actorId: string | Types.ObjectId;
  actorRole: string;
  action: AuditAction;
  description: string;
  vendorId?: string | Types.ObjectId | null;
  payload?: Record<string, any>;
  timestamp?: Date;
}

export async function createAuditEvent(params: CreateAuditEventParams): Promise<IAuditLog> {
  const tenderObjectId = new Types.ObjectId(params.tenderId);
  const actorObjectId = new Types.ObjectId(params.actorId);
  const vendorObjectId = params.vendorId ? new Types.ObjectId(params.vendorId) : null;
  const timestamp = params.timestamp ?? new Date();
  const payload = params.payload ?? {};

  const MAX_ATTEMPTS = 15;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Find the most recent audit entry for this tender to obtain the latest seq and hash
      const lastEntry = await AuditLog.findOne({ tender: tenderObjectId })
        .sort({ seq: -1 })
        .exec();

      const seq = lastEntry ? lastEntry.seq + 1 : 1;
      const prevHash = lastEntry ? lastEntry.hash : GENESIS_PREV_HASH;

      const hash = computeAuditHash({
        seq,
        timestamp,
        actorId: actorObjectId.toString(),
        action: params.action,
        tenderId: tenderObjectId.toString(),
        vendorId: vendorObjectId ? vendorObjectId.toString() : null,
        description: params.description,
        payload,
        prevHash,
      });

      const entry = new AuditLog({
        tender: tenderObjectId,
        seq,
        timestamp,
        actor: actorObjectId,
        actorRole: params.actorRole,
        action: params.action,
        vendor: vendorObjectId,
        description: params.description,
        payload,
        prevHash,
        hash,
      });

      await entry.save();
      return entry;
    } catch (err: any) {
      if (err.code === 11000 || (err.name === 'MongoServerError' && err.code === 11000)) {
        // Concurrency collision on (tender, seq) -> re-read tail and retry
        await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 5) + 1));
        continue;
      }
      throw err;
    }
  }

  throw new Error('AUDIT_APPEND_CONTENTION: Exceeded maximum retry attempts due to concurrent audit writes');
}

export async function verifyAuditChain(
  tenderId: string | Types.ObjectId
): Promise<AuditVerificationResult> {
  const tenderObjectId = new Types.ObjectId(tenderId);
  const entries = await AuditLog.find({ tender: tenderObjectId })
    .sort({ seq: 1 })
    .exec();

  if (entries.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
    };
  }

  let prevHash = GENESIS_PREV_HASH;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedSeq = i + 1;

    // Check sequence continuity
    if (entry.seq !== expectedSeq) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenSeq: entry.seq,
        reason: `SEQUENCE_GAP_DETECTED: Expected seq ${expectedSeq}, found ${entry.seq}`,
      };
    }

    // Check previous hash linkage
    if (entry.prevHash !== prevHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenSeq: entry.seq,
        reason: `PREV_HASH_CHAIN_BROKEN: Entry prevHash does not match prior entry hash at seq ${entry.seq}`,
      };
    }

    // Check hash integrity against content
    const recomputedHash = computeAuditHash({
      seq: entry.seq,
      timestamp: entry.timestamp,
      actorId: entry.actor.toString(),
      action: entry.action,
      tenderId: entry.tender.toString(),
      vendorId: entry.vendor ? entry.vendor.toString() : null,
      description: entry.description,
      payload: entry.payload ?? {},
      prevHash: entry.prevHash,
    });

    if (entry.hash !== recomputedHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenSeq: entry.seq,
        reason: `ENTRY_CONTENT_MUTATED: Recomputed hash ${recomputedHash} does not match stored hash ${entry.hash} at seq ${entry.seq}`,
      };
    }

    prevHash = entry.hash;
  }

  return {
    valid: true,
    totalEntries: entries.length,
  };
}
