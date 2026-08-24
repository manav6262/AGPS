/**
 * Bid Model (SPEC §8.5, §14.3)
 */

import { Schema, model, Document, Types } from 'mongoose';
import { Provenance, DataIntegrityRollup, DEFAULT_PROVENANCE } from '@agps/shared';
import { ProvenanceSchema } from './provenance.js';

export interface IBid extends Document {
  _id: Types.ObjectId;
  tender: Types.ObjectId;
  vendor: Types.ObjectId;
  revision: number;
  isLatest: boolean;
  submittedAt: Date;
  configVersionAtSubmission: number;
  configHashAtSubmission: string;

  // Technical envelope
  technicalValues: Record<string, { value: any; provenance: Provenance }>;
  deliveryDays: { value: number; provenance: Provenance };
  vendorSnapshot: {
    experienceYears: number;
    annualTurnoverMinor: number;
    isBlacklisted?: boolean;
    provenance: Provenance;
  };

  // Financial envelope (sealed until FINANCIAL_OPEN)
  priceMinor: number;

  // Derived, stored
  derivedQualityScore: number;
  dataIntegrity: DataIntegrityRollup;

  createdAt: Date;
  updatedAt: Date;
}

const bidSchema = new Schema<IBid>(
  {
    tender: {
      type: Schema.Types.ObjectId,
      ref: 'Tender',
      required: true,
      index: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    revision: {
      type: Number,
      required: true,
      default: 1,
    },
    isLatest: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    submittedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    configVersionAtSubmission: {
      type: Number,
      required: true,
    },
    configHashAtSubmission: {
      type: String,
      required: true,
    },

    // Technical envelope
    technicalValues: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    deliveryDays: {
      value: { type: Number, required: true, min: 1 },
      provenance: { type: ProvenanceSchema, default: () => ({ ...DEFAULT_PROVENANCE }) },
    },
    vendorSnapshot: {
      experienceYears: { type: Number, required: true, min: 0 },
      annualTurnoverMinor: { type: Number, required: true, min: 0 },
      isBlacklisted: { type: Boolean, default: false },
      provenance: { type: ProvenanceSchema, default: () => ({ ...DEFAULT_PROVENANCE }) },
    },

    // Financial envelope (SPEC §17.4 — sealed by default)
    priceMinor: {
      type: Number,
      required: true,
      min: 1, // positive integer paise (SPEC §11.2, Invariant 5)
      select: false, // Default-excluded; must opt in explicitly with +priceMinor
    },

    // Derived, stored
    derivedQualityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    dataIntegrity: {
      verifiedFieldCount: { type: Number, default: 0 },
      totalFieldCount: { type: Number, default: 0 },
      overallStatus: { type: String, default: 'UNVERIFIED' },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (SPEC §8.5)
bidSchema.index({ tender: 1, vendor: 1, revision: 1 }, { unique: true });
bidSchema.index(
  { tender: 1, vendor: 1, isLatest: 1 },
  { unique: true, partialFilterExpression: { isLatest: true } }
);

export const Bid = model<IBid>('Bid', bidSchema);
