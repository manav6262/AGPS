/**
 * Tender Model and Config Snapshot Schemas (SPEC §6.3, §8.3, §14)
 */

import { Schema, model, Document, Types } from 'mongoose';
import {
  TenderConfigSnapshot,
  ConfigLockState,
  Constraints,
  EligibilityRule,
  TechnicalCriterion,
  ScoringCriterion,
} from '@agps/shared';

export type TenderStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'BIDDING_OPEN'
  | 'BIDDING_CLOSED'
  | 'FINANCIAL_OPEN'
  | 'UNDER_EVALUATION'
  | 'EVALUATED'
  | 'WINNER_SELECTED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'FAILED';

export const ConstraintsSchema = new Schema<Constraints>(
  {
    maxBudgetMinor: { type: Number, required: true },
    minQualityScore: { type: Number, required: true },
    maxDeliveryDays: { type: Number, required: true },
    minExperienceYears: { type: Number, required: true },
  },
  { _id: false }
);

export const EligibilityRuleSchema = new Schema<EligibilityRule>(
  {
    code: { type: String, required: true },
    field: { type: String, required: true },
    operator: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    message: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: true },
  },
  { _id: false }
);

export const TechnicalCriterionSchema = new Schema<TechnicalCriterion>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    points: { type: Number, required: true },
    type: {
      type: String,
      enum: ['numeric', 'boolean', 'enum', 'checklist'],
      required: true,
    },
    direction: { type: String, enum: ['lower', 'higher'] },
    min: { type: Number },
    max: { type: Number },
    options: [
      {
        value: { type: String, required: true },
        label: { type: String, required: true },
        fraction: { type: Number, required: true },
        _id: false,
      },
    ],
    items: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        fraction: { type: Number, required: true },
        _id: false,
      },
    ],
  },
  { _id: false }
);

export const ScoringCriterionSchema = new Schema<ScoringCriterion>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    direction: { type: String, enum: ['lower', 'higher'], required: true },
    weight: { type: Number, required: true },
    unit: { type: String, required: true },
    valueSource: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false }
);

export const TenderConfigSnapshotSchema = new Schema<TenderConfigSnapshot>(
  {
    version: { type: Number, required: true },
    lockState: {
      type: String,
      enum: ['SOFT_LOCKED', 'HARD_LOCKED'],
      required: true,
    },
    lockedAt: { type: Date, required: true },
    lockedBy: { type: String, required: true },
    hardLockedAt: { type: Date, default: null },
    engineVersion: { type: String, required: true, default: '1.0.0' },
    rankingMethod: { type: String, enum: ['SAW'], required: true, default: 'SAW' },
    normalizationMethod: { type: String, enum: ['RATIO'], required: true, default: 'RATIO' },
    constraints: { type: ConstraintsSchema, required: true },
    eligibilityRules: { type: [EligibilityRuleSchema], required: true },
    technicalCriteria: { type: [TechnicalCriterionSchema], required: true },
    scoringCriteria: { type: [ScoringCriterionSchema], required: true },
    tieBreakOrder: { type: [String], required: true },
    configHash: { type: String, required: true },
  },
  { _id: false }
);

export interface ITender extends Document {
  _id: Types.ObjectId;
  tenderCode: string;
  title: string;
  description: string;
  department: string;
  category: string;
  createdBy: Types.ObjectId;
  status: TenderStatus;
  startAt: Date;
  deadlineAt: Date;

  // Working config
  constraints: Constraints;
  eligibilityRules: EligibilityRule[];
  technicalCriteria: TechnicalCriterion[];
  scoringCriteria: ScoringCriterion[];
  normalizationMethod: 'RATIO';
  rankingMethod: 'SAW';
  tieBreakOrder: string[];

  // Snapshot and locking
  lockedConfig: TenderConfigSnapshot | null;
  configHistory: TenderConfigSnapshot[];
  configLockState: ConfigLockState;
  firstBidAt: Date | null;

  // Reissue lineage
  supersedes: Types.ObjectId | null;
  supersededBy: Types.ObjectId | null;

  // Outcome
  latestEvaluation: Types.ObjectId | null;
  recommendedBid: Types.ObjectId | null;
  awardedBid: Types.ObjectId | null;
  awardJustification: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const tenderSchema = new Schema<ITender>(
  {
    tenderCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PUBLISHED',
        'BIDDING_OPEN',
        'BIDDING_CLOSED',
        'FINANCIAL_OPEN',
        'UNDER_EVALUATION',
        'EVALUATED',
        'WINNER_SELECTED',
        'CLOSED',
        'CANCELLED',
        'FAILED',
      ],
      default: 'DRAFT',
      index: true,
    },
    startAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },

    // Working config
    constraints: {
      type: ConstraintsSchema,
      required: true,
      default: () => ({
        maxBudgetMinor: 0,
        minQualityScore: 0,
        maxDeliveryDays: 0,
        minExperienceYears: 0,
      }),
    },
    eligibilityRules: { type: [EligibilityRuleSchema], default: [] },
    technicalCriteria: { type: [TechnicalCriterionSchema], default: [] },
    scoringCriteria: { type: [ScoringCriterionSchema], default: [] },
    normalizationMethod: { type: String, enum: ['RATIO'], default: 'RATIO' },
    rankingMethod: { type: String, enum: ['SAW'], default: 'SAW' },
    tieBreakOrder: {
      type: [String],
      default: [
        'finalScore',
        'price',
        'derivedQualityScore',
        'deliveryDays',
        'submittedAt',
        'bidId',
      ],
    },

    // Snapshot and locking
    lockedConfig: { type: TenderConfigSnapshotSchema, default: null },
    configHistory: { type: [TenderConfigSnapshotSchema], default: [] },
    configLockState: {
      type: String,
      enum: ['UNLOCKED', 'SOFT_LOCKED', 'HARD_LOCKED'],
      default: 'UNLOCKED',
      index: true,
    },
    firstBidAt: { type: Date, default: null, index: true },

    // Lineage
    supersedes: { type: Schema.Types.ObjectId, ref: 'Tender', default: null },
    supersededBy: { type: Schema.Types.ObjectId, ref: 'Tender', default: null },

    // Outcome
    latestEvaluation: { type: Schema.Types.ObjectId, ref: 'Evaluation', default: null },
    recommendedBid: { type: Schema.Types.ObjectId, ref: 'Bid', default: null },
    awardedBid: { type: Schema.Types.ObjectId, ref: 'Bid', default: null },
    awardJustification: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

export const Tender = model<ITender>('Tender', tenderSchema);
