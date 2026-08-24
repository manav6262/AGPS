/**
 * Evaluation Model (SPEC §8.6, §12.2)
 */

import { Schema, model, Document, Types } from 'mongoose';
import {
  TenderConfigSnapshot,
  EvaluationSummary,
  RankedResult,
  ProvenanceSummary,
} from '@agps/shared';
import { TenderConfigSnapshotSchema } from './tender.js';

export interface IEvaluation extends Document {
  _id: Types.ObjectId;
  tender: Types.ObjectId;
  runNumber: number;
  evaluatedBy: Types.ObjectId;
  evaluatedAt: Date;
  configSnapshot: TenderConfigSnapshot;
  configHash: string;
  durationMs: number;
  provenanceSummary: ProvenanceSummary;
  summary: EvaluationSummary;
  results: RankedResult[];
  createdAt: Date;
  updatedAt: Date;
}

const scoreBreakdownItemSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    rawValue: { type: Number, required: true },
    unit: { type: String, required: true },
    normalizedScore: { type: Number, required: true },
    weight: { type: Number, required: true },
    weightedScore: { type: Number, required: true },
    provenance: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const failedRuleSchema = new Schema(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
    field: { type: String, required: true },
    operator: { type: String, required: true },
    actualValue: { type: Schema.Types.Mixed },
    requiredValue: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const rankedResultSchema = new Schema(
  {
    bidId: { type: String, required: true },
    vendorId: { type: String, required: true },
    vendorName: { type: String },
    eligible: { type: Boolean, required: true },
    failedRules: { type: [failedRuleSchema], default: [] },
    rawValues: { type: Schema.Types.Mixed },
    breakdown: { type: [scoreBreakdownItemSchema] },
    finalScore: { type: Number },
    rank: { type: Number },
    tieBrokenBy: { type: String, default: null },
    isNonComparative: { type: Boolean, default: false },
  },
  { _id: false }
);

const evaluationSchema = new Schema<IEvaluation>(
  {
    tender: {
      type: Schema.Types.ObjectId,
      ref: 'Tender',
      required: true,
      index: true,
    },
    runNumber: {
      type: Number,
      required: true,
    },
    evaluatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    evaluatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    configSnapshot: {
      type: TenderConfigSnapshotSchema,
      required: true,
    },
    configHash: {
      type: String,
      required: true,
    },
    durationMs: {
      type: Number,
      required: true,
    },
    provenanceSummary: {
      allSelfReported: { type: Boolean, required: true, default: true },
      verifiedFieldCount: { type: Number, required: true, default: 0 },
      totalFieldCount: { type: Number, required: true, default: 0 },
      overallStatus: { type: String, required: true, default: 'UNVERIFIED' },
    },
    summary: {
      totalBids: { type: Number, required: true },
      eligibleCount: { type: Number, required: true },
      rejectedCount: { type: Number, required: true },
      outcome: {
        type: String,
        enum: ['RANKED', 'NO_ELIGIBLE_VENDORS'],
        required: true,
      },
      winnerBid: { type: String, default: null },
      winningScore: { type: Number, default: null },
    },
    results: {
      type: [rankedResultSchema],
      required: true,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

evaluationSchema.index({ tender: 1, runNumber: 1 }, { unique: true });

export const Evaluation = model<IEvaluation>('Evaluation', evaluationSchema);
