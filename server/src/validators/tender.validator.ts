/**
 * Tender Zod Validators with .strict() (SPEC §17.3)
 */

import { z } from 'zod';

const constraintsSchema = z
  .object({
    maxBudgetMinor: z.number().int().positive(),
    minQualityScore: z.number().min(0).max(100),
    maxDeliveryDays: z.number().int().min(1),
    minExperienceYears: z.number().min(0),
  })
  .strict();

const eligibilityRuleSchema = z
  .object({
    code: z.string().min(1),
    field: z.string().min(1),
    operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'neq', 'in', 'nin', 'isTrue', 'isFalse']),
    value: z.union([z.number(), z.boolean(), z.string(), z.array(z.string())]),
    message: z.string().min(1),
    enabled: z.boolean().default(true),
  })
  .strict();

const technicalCriterionSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    points: z.number().int().positive(),
    type: z.enum(['numeric', 'boolean', 'enum', 'checklist']),
    direction: z.enum(['lower', 'higher']).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    options: z
      .array(
        z.object({
          value: z.string(),
          label: z.string(),
          fraction: z.number().min(0).max(1),
        }).strict()
      )
      .optional(),
    items: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          fraction: z.number().min(0).max(1),
        }).strict()
      )
      .optional(),
  })
  .strict();

const scoringCriterionSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    direction: z.enum(['lower', 'higher']),
    weight: z.number().int().positive(),
    unit: z.string().min(1),
    valueSource: z.union([
      z.object({ type: z.literal('BID_FIELD'), path: z.enum(['priceMinor', 'deliveryDays']) }).strict(),
      z.object({ type: z.literal('VENDOR_FIELD'), path: z.enum(['experienceYears', 'annualTurnoverMinor']) }).strict(),
      z.object({ type: z.literal('TECHNICAL_VALUE'), path: z.string() }).strict(),
      z.object({ type: z.literal('DERIVED_QUALITY') }).strict(),
    ]),
  })
  .strict();

export const createTenderSchema = z
  .object({
    tenderCode: z.string().min(3).trim(),
    title: z.string().min(3).trim(),
    description: z.string().min(3).trim(),
    department: z.string().min(2).trim(),
    category: z.string().min(2).trim(),
    startAt: z.string().datetime().or(z.date()),
    deadlineAt: z.string().datetime().or(z.date()),
    constraints: constraintsSchema,
    eligibilityRules: z.array(eligibilityRuleSchema).default([]),
    technicalCriteria: z.array(technicalCriterionSchema).default([]),
    scoringCriteria: z.array(scoringCriterionSchema).default([]),
    tieBreakOrder: z.array(z.string()).optional(),
  })
  .strict();

export const updateTenderSchema = z
  .object({
    tenderCode: z.string().min(3).trim().optional(), // If provided in post-DRAFT, controller will reject with 409
    title: z.string().min(3).trim().optional(),
    description: z.string().min(3).trim().optional(),
    department: z.string().min(2).trim().optional(),
    deadlineAt: z.string().datetime().or(z.date()).optional(),
    constraints: constraintsSchema.optional(),
    eligibilityRules: z.array(eligibilityRuleSchema).optional(),
    technicalCriteria: z.array(technicalCriterionSchema).optional(),
    scoringCriteria: z.array(scoringCriterionSchema).optional(),
    tieBreakOrder: z.array(z.string()).optional(),
  })
  .strict();

export const transitionTenderSchema = z
  .object({
    targetStatus: z.enum([
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
    ]),
  })
  .strict();
