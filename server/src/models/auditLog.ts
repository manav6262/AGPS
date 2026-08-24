/**
 * Audit Log Model with Append-Only Enforcement (SPEC §8.7, §16)
 */

import { Schema, model, Document, Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../utils/canonicalJson.js';

export const AUDIT_ACTIONS = [
  'TENDER_CREATED',
  'TENDER_PUBLISHED',
  'TENDER_CONFIG_REVISED',
  'TENDER_CONFIG_HARD_LOCKED',
  'TENDER_REISSUED',
  'TENDER_CANCELLED',
  'TENDER_FAILED',
  'BIDDING_OPENED',
  'BIDDING_CLOSED',
  'BID_SUBMITTED',
  'BID_REVISED',
  'FINANCIAL_BIDS_OPENED',
  'EVALUATION_STARTED',
  'EVALUATION_COMPLETED',
  'VENDOR_REJECTED',
  'VENDOR_RANKED',
  'WINNER_RECOMMENDED',
  'WINNER_CONFIRMED',
  'WINNER_OVERRIDDEN',
  'TENDER_CLOSED',
  'VENDOR_BLACKLISTED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  tender: Types.ObjectId;
  seq: number;
  timestamp: Date;
  actor: Types.ObjectId;
  actorRole: string;
  action: AuditAction;
  vendor: Types.ObjectId | null;
  description: string;
  payload: Record<string, any>;
  prevHash: string;
  hash: string;
  createdAt: Date;
  updatedAt: Date;
}

export const GENESIS_PREV_HASH = '0'.repeat(64);

export function computeAuditHash(entry: {
  seq: number;
  timestamp: Date | string;
  actorId: string;
  action: string;
  tenderId: string;
  vendorId: string | null;
  description: string;
  payload: Record<string, any>;
  prevHash: string;
}): string {
  const canonicalPayload = canonicalJson({
    seq: entry.seq,
    timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
    actorId: entry.actorId,
    action: entry.action,
    tenderId: entry.tenderId,
    vendorId: entry.vendorId,
    description: entry.description,
    payload: entry.payload ?? {},
  });

  return createHash('sha256')
    .update(entry.prevHash + '|' + canonicalPayload)
    .digest('hex');
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    tender: {
      type: Schema.Types.ObjectId,
      ref: 'Tender',
      required: true,
      index: true,
    },
    seq: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: AUDIT_ACTIONS,
      required: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    description: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    prevHash: {
      type: String,
      required: true,
    },
    hash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ tender: 1, seq: 1 }, { unique: true });

// Append-only enforcement: reject all modifications and deletions at Mongoose level (SPEC §16)
const rejectMutation = function () {
  throw new Error('AUDIT_LOG_IMMUTABLE: Audit log is append-only. Mutations and deletions are forbidden.');
};

auditLogSchema.pre('updateOne', rejectMutation);
auditLogSchema.pre('updateMany', rejectMutation);
auditLogSchema.pre('findOneAndUpdate', rejectMutation);
auditLogSchema.pre('replaceOne', rejectMutation);
auditLogSchema.pre('deleteOne', rejectMutation);
auditLogSchema.pre('deleteMany', rejectMutation);
auditLogSchema.pre('findOneAndDelete', rejectMutation);
auditLogSchema.pre('findOneAndRemove' as any, rejectMutation);

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
