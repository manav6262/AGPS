/**
 * AGPS Phase 1 Unit Tests: Tests 1–20 (SPEC §22)
 *
 * Pure unit tests with zero database and zero network.
 * Must execute in under one second.
 */

import { describe, it, expect } from 'vitest';
import {
  BidContext,
  EligibilityRule,
  ScoringCriterion,
  TechnicalCriterion,
  TenderConfigSnapshot,
} from '@agps/shared';
import {
  evaluateEligibility,
  resolveCriterionValue,
  RatioNormalizationStrategy,
  scoreCohort,
  SawRankingStrategy,
  evaluateTenderPure,
} from '../../engines/index.js';
import {
  validateScoringCriteria,
} from '../../utils/validation.js';
import { hashConfig } from '../../utils/hash.js';

// Base default rules matching SPEC §10.3
const defaultRules: EligibilityRule[] = [
  {
    code: 'PRICE_WITHIN_BUDGET',
    field: 'price',
    operator: 'lte',
    value: 100000000, // ₹10,00,000 in paise
    message: 'Price exceeds maximum budget',
    enabled: true,
  },
  {
    code: 'QUALITY_MEETS_MINIMUM',
    field: 'derivedQualityScore',
    operator: 'gte',
    value: 70,
    message: 'Technical quality does not meet minimum threshold',
    enabled: true,
  },
  {
    code: 'DELIVERY_WITHIN_LIMIT',
    field: 'deliveryDays',
    operator: 'lte',
    value: 30,
    message: 'Delivery days exceed permitted limit',
    enabled: true,
  },
  {
    code: 'EXPERIENCE_MEETS_MINIMUM',
    field: 'experienceYears',
    operator: 'gte',
    value: 3,
    message: 'Vendor does not meet minimum experience requirement',
    enabled: true,
  },
  {
    code: 'VENDOR_NOT_BLACKLISTED',
    field: 'vendorBlacklisted',
    operator: 'isFalse',
    value: false,
    message: 'Blacklisted vendors are not eligible to bid',
    enabled: true,
  },
];

// Base default scoring criteria matching SPEC §7.5 (40/30/20/10)
const defaultScoringCriteria: ScoringCriterion[] = [
  {
    key: 'price',
    label: 'Price',
    direction: 'lower',
    weight: 40,
    unit: 'INR',
    valueSource: { type: 'BID_FIELD', path: 'priceMinor' },
  },
  {
    key: 'quality',
    label: 'Quality',
    direction: 'higher',
    weight: 30,
    unit: 'score',
    valueSource: { type: 'DERIVED_QUALITY' },
  },
  {
    key: 'delivery',
    label: 'Delivery',
    direction: 'lower',
    weight: 20,
    unit: 'days',
    valueSource: { type: 'BID_FIELD', path: 'deliveryDays' },
  },
  {
    key: 'experience',
    label: 'Experience',
    direction: 'higher',
    weight: 10,
    unit: 'years',
    valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' },
  },
];

const defaultSnapshot: TenderConfigSnapshot = {
  version: 1,
  lockState: 'SOFT_LOCKED',
  lockedAt: new Date().toISOString(),
  lockedBy: 'admin-1',
  hardLockedAt: null,
  engineVersion: '1.0.0',
  rankingMethod: 'SAW',
  normalizationMethod: 'RATIO',
  constraints: {
    maxBudgetMinor: 100000000,
    minQualityScore: 70,
    maxDeliveryDays: 30,
    minExperienceYears: 3,
  },
  eligibilityRules: defaultRules,
  technicalCriteria: [],
  scoringCriteria: defaultScoringCriteria,
  tieBreakOrder: [
    'finalScore',
    'price',
    'derivedQualityScore',
    'deliveryDays',
    'submittedAt',
    'bidId',
  ],
  configHash: '',
};

describe('AGPS Pure Engines — Tests 1–20 (SPEC §22)', () => {
  // ==========================================
  // Eligibility Tests (1–5)
  // ==========================================

  it('Test 1: price > budget -> REJECT', () => {
    const bid: BidContext = {
      bidId: 'bid-b',
      vendorId: 'vendor-b',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 120000000, // ₹12,00,000 > ₹10,00,000
      deliveryDays: 25,
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
      technicalValues: {},
      derivedQualityScore: 80,
    };

    const res = evaluateEligibility(bid, defaultRules);
    expect(res.eligible).toBe(false);
    expect(res.failedRules.some((r) => r.code === 'PRICE_WITHIN_BUDGET')).toBe(true);
  });

  it('Test 2: quality < min -> REJECT', () => {
    const bid: BidContext = {
      bidId: 'bid-c',
      vendorId: 'vendor-c',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 80000000,
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
      technicalValues: {},
      derivedQualityScore: 62, // 62 < 70 min
    };

    const res = evaluateEligibility(bid, defaultRules);
    expect(res.eligible).toBe(false);
    expect(res.failedRules.some((r) => r.code === 'QUALITY_MEETS_MINIMUM')).toBe(true);
  });

  it('Test 3: delivery > max -> REJECT', () => {
    const bid: BidContext = {
      bidId: 'bid-d',
      vendorId: 'vendor-d',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 85000000,
      deliveryDays: 45, // 45 > 30 max
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
      technicalValues: {},
      derivedQualityScore: 85,
    };

    const res = evaluateEligibility(bid, defaultRules);
    expect(res.eligible).toBe(false);
    expect(res.failedRules.some((r) => r.code === 'DELIVERY_WITHIN_LIMIT')).toBe(true);
  });

  it('Test 4: all pass -> ELIGIBLE', () => {
    const bid: BidContext = {
      bidId: 'bid-a',
      vendorId: 'vendor-a',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 80000000, // ₹8,00,000 <= ₹10,00,000
      deliveryDays: 20, // 20 <= 30
      vendorSnapshot: { experienceYears: 8, annualTurnoverMinor: 100000000, isBlacklisted: false },
      technicalValues: {},
      derivedQualityScore: 85, // 85 >= 70
    };

    const res = evaluateEligibility(bid, defaultRules);
    expect(res.eligible).toBe(true);
    expect(res.failedRules).toHaveLength(0);
  });

  it('Test 5: multiple failures -> ALL returned', () => {
    const bid: BidContext = {
      bidId: 'bid-f',
      vendorId: 'vendor-f',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 110000000, // fails budget
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 1, annualTurnoverMinor: 20000000, isBlacklisted: false }, // fails experience (< 3)
      technicalValues: {},
      derivedQualityScore: 80,
    };

    const res = evaluateEligibility(bid, defaultRules);
    expect(res.eligible).toBe(false);
    expect(res.failedRules.length).toBeGreaterThanOrEqual(2);
    const failedCodes = res.failedRules.map((r) => r.code);
    expect(failedCodes).toContain('PRICE_WITHIN_BUDGET');
    expect(failedCodes).toContain('EXPERIENCE_MEETS_MINIMUM');
  });

  // ==========================================
  // Scoring & Ranking Tests (6–15)
  // ==========================================

  it('Test 6: weights ≠ 100 -> publish blocked', () => {
    const invalidCriteria: ScoringCriterion[] = [
      { key: 'price', label: 'Price', direction: 'lower', weight: 40, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      { key: 'quality', label: 'Quality', direction: 'higher', weight: 30, unit: 'score', valueSource: { type: 'DERIVED_QUALITY' } },
      { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
      { key: 'experience', label: 'Experience', direction: 'higher', weight: 20, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
      // Sum = 110 != 100
    ];

    const validation = validateScoringCriteria(invalidCriteria);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('sum to exactly 100'))).toBe(true);
  });

  it('Test 7: two eligible -> correct scores and ranks', () => {
    const bidA: BidContext = {
      bidId: 'bid-a',
      vendorId: 'vendor-a',
      vendorName: 'Vendor A',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 80000000,
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 8, annualTurnoverMinor: 100000000 },
      technicalValues: {},
      derivedQualityScore: 85,
    };

    const bidE: BidContext = {
      bidId: 'bid-e',
      vendorId: 'vendor-e',
      vendorName: 'Vendor E',
      submittedAt: '2026-03-01T10:05:00Z',
      priceMinor: 74000000,
      deliveryDays: 15,
      vendorSnapshot: { experienceYears: 10, annualTurnoverMinor: 150000000 },
      technicalValues: {},
      derivedQualityScore: 100,
    };

    const out = evaluateTenderPure([bidA, bidE], defaultSnapshot);
    expect(out.summary.outcome).toBe('RANKED');
    expect(out.summary.eligibleCount).toBe(2);
    expect(out.results.filter((r) => r.eligible)).toHaveLength(2);
    const rank1 = out.results.find((r) => r.rank === 1);
    const rank2 = out.results.find((r) => r.rank === 2);
    expect(rank1).toBeDefined();
    expect(rank2).toBeDefined();
    expect(rank1!.finalScore).toBeGreaterThanOrEqual(rank2!.finalScore!);
  });

  it('Test 8: golden vector reproduces 85.50 exactly (SPEC §11.5)', () => {
    // Vendor A: price ₹8,00,000 (80000000 paise), quality 85, delivery 20d, experience 8y
    const vendorA: BidContext = {
      bidId: 'vendor-a-bid',
      vendorId: 'vendor-a',
      vendorName: 'Vendor A',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 80000000,
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 8, annualTurnoverMinor: 50000000 },
      technicalValues: {},
      derivedQualityScore: 85,
    };

    // Cohort boundary reference (minPrice 74000000, maxQuality 100, minDelivery 15, maxExperience 10)
    const cohortRef: BidContext = {
      bidId: 'cohort-ref-bid',
      vendorId: 'cohort-ref',
      vendorName: 'Cohort Reference',
      submittedAt: '2026-03-01T11:00:00Z',
      priceMinor: 74000000,
      deliveryDays: 15,
      vendorSnapshot: { experienceYears: 10, annualTurnoverMinor: 100000000 },
      technicalValues: {},
      derivedQualityScore: 100,
    };

    const scored = scoreCohort([vendorA, cohortRef], defaultScoringCriteria);
    const scoredA = scored.find((s) => s.bid.bidId === 'vendor-a-bid')!;

    // Normalizations:
    // Price: (74000000 / 80000000) * 100 = 92.50
    // Quality: (85 / 100) * 100 = 85.00
    // Delivery: (15 / 20) * 100 = 75.00
    // Experience: (8 / 10) * 100 = 80.00
    // Weighted:
    // 92.50 * 0.40 = 37.00
    // 85.00 * 0.30 = 25.50
    // 75.00 * 0.20 = 15.00
    // 80.00 * 0.10 = 8.00
    // Sum = 85.50

    const priceBreakdown = scoredA.breakdown.find((b) => b.key === 'price')!;
    const qualityBreakdown = scoredA.breakdown.find((b) => b.key === 'quality')!;
    const deliveryBreakdown = scoredA.breakdown.find((b) => b.key === 'delivery')!;
    const experienceBreakdown = scoredA.breakdown.find((b) => b.key === 'experience')!;

    expect(priceBreakdown.normalizedScore).toBeCloseTo(92.50, 4);
    expect(priceBreakdown.weightedScore).toBeCloseTo(37.00, 4);

    expect(qualityBreakdown.normalizedScore).toBeCloseTo(85.00, 4);
    expect(qualityBreakdown.weightedScore).toBeCloseTo(25.50, 4);

    expect(deliveryBreakdown.normalizedScore).toBeCloseTo(75.00, 4);
    expect(deliveryBreakdown.weightedScore).toBeCloseTo(15.00, 4);

    expect(experienceBreakdown.normalizedScore).toBeCloseTo(80.00, 4);
    expect(experienceBreakdown.weightedScore).toBeCloseTo(8.00, 4);

    expect(scoredA.finalScore).toBeCloseTo(85.50, 6);
  });

  it('Test 9: breakdown sums to final within 1e-9', () => {
    const bidA: BidContext = {
      bidId: 'bid-a',
      vendorId: 'vendor-a',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 78500000,
      deliveryDays: 18,
      vendorSnapshot: { experienceYears: 7, annualTurnoverMinor: 80000000 },
      technicalValues: {},
      derivedQualityScore: 88,
    };

    const bidB: BidContext = {
      bidId: 'bid-b',
      vendorId: 'vendor-b',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 91000000,
      deliveryDays: 24,
      vendorSnapshot: { experienceYears: 4, annualTurnoverMinor: 60000000 },
      technicalValues: {},
      derivedQualityScore: 79,
    };

    const scored = scoreCohort([bidA, bidB], defaultScoringCriteria);
    for (const s of scored) {
      const sumWeighted = s.breakdown.reduce((acc, item) => acc + item.weightedScore, 0);
      expect(Math.abs(sumWeighted - s.finalScore)).toBeLessThan(1e-9);
    }
  });

  it('Test 10: max === min -> all 100, no NaN', () => {
    const strategy = new RatioNormalizationStrategy();
    const cohort = [5, 5, 5];

    const scoreHigher = strategy.normalize(5, cohort, 'higher');
    const scoreLower = strategy.normalize(5, cohort, 'lower');

    expect(scoreHigher).toBe(100);
    expect(scoreLower).toBe(100);
    expect(isNaN(scoreHigher)).toBe(false);
    expect(isNaN(scoreLower)).toBe(false);

    // All zero case
    const zeroCohort = [0, 0];
    expect(strategy.normalize(0, zeroCohort, 'higher')).toBe(100);
  });

  it('Test 11: single eligible -> 100.00, flagged non-comparative', () => {
    const singleBid: BidContext = {
      bidId: 'bid-sole',
      vendorId: 'vendor-sole',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 85000000,
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
      technicalValues: {},
      derivedQualityScore: 80,
    };

    const out = evaluateTenderPure([singleBid], defaultSnapshot);
    expect(out.summary.outcome).toBe('RANKED');
    expect(out.summary.eligibleCount).toBe(1);
    const soleResult = out.results.find((r) => r.bidId === 'bid-sole')!;
    expect(soleResult.finalScore).toBeCloseTo(100.00, 4);
    expect(soleResult.isNonComparative).toBe(true);
    expect(soleResult.rank).toBe(1);
  });

  it('Test 12: zero eligible -> FAILED, no crash', () => {
    const rejectedBid: BidContext = {
      bidId: 'bid-rejected',
      vendorId: 'vendor-rejected',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 150000000, // ₹15,00,000 > ₹10,00,000 max budget
      deliveryDays: 50, // 50 > 30
      vendorSnapshot: { experienceYears: 1, annualTurnoverMinor: 10000000 },
      technicalValues: {},
      derivedQualityScore: 50,
    };

    const out = evaluateTenderPure([rejectedBid], defaultSnapshot);
    expect(out.summary.outcome).toBe('NO_ELIGIBLE_VENDORS');
    expect(out.summary.eligibleCount).toBe(0);
    expect(out.summary.rejectedCount).toBe(1);
    expect(out.summary.winnerBid).toBeNull();
    expect(out.summary.winningScore).toBeNull();
    expect(out.results[0].eligible).toBe(false);
    expect(out.results[0].failedRules.length).toBeGreaterThanOrEqual(1);
  });

  it('Test 13: exact tie -> cascade resolves, tieBrokenBy set', () => {
    // Two bids with identical scores, but bid-1 is cheaper
    const bid1: BidContext = {
      bidId: 'bid-1',
      vendorId: 'vendor-1',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 80000000,
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
      technicalValues: {},
      derivedQualityScore: 80,
    };

    const bid2: BidContext = {
      bidId: 'bid-2',
      vendorId: 'vendor-2',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 85000000, // more expensive
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
      technicalValues: {},
      derivedQualityScore: 80,
    };

    // Synthesize a scored cohort where both have identical finalScore
    const scoredCohort = [
      { bid: bid2, rawValues: {}, breakdown: [], finalScore: 80.0 },
      { bid: bid1, rawValues: {}, breakdown: [], finalScore: 80.0 },
    ];

    const saw = new SawRankingStrategy();
    const ranked = saw.rank(scoredCohort);

    expect(ranked[0].bidId).toBe('bid-1'); // bid1 wins on price
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].tieBrokenBy).toBe('price');

    // Assert cascade falls through to bidId and produces deterministic code-unit order for mixed case and digits
    const mixedBids: BidContext[] = ['a1', 'A1', 'B0', '10'].map((id) => ({
      bidId: id,
      vendorId: `vendor-${id}`,
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 80000000,
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
      technicalValues: {},
      derivedQualityScore: 80,
    }));

    const mixedScoredCohort = mixedBids.map((b) => ({
      bid: b,
      rawValues: {},
      breakdown: [],
      finalScore: 80.0,
    }));

    const mixedRanked = saw.rank(mixedScoredCohort);
    const rankedBidIds = mixedRanked.map((r) => r.bidId);
    // Deterministic UTF-16 code-unit order: "10" (0x31) < "A1" (0x41) < "B0" (0x42) < "a1" (0x61)
    expect(rankedBidIds).toEqual(['10', 'A1', 'B0', 'a1']);
    expect(mixedRanked[1].tieBrokenBy).toBe('bidId');
  });

  it('Test 14: determinism — two runs identical + identical hash', () => {
    const bids: BidContext[] = [
      {
        bidId: 'bid-a',
        vendorId: 'vendor-a',
        submittedAt: '2026-03-01T10:00:00Z',
        priceMinor: 80000000,
        deliveryDays: 20,
        vendorSnapshot: { experienceYears: 8, annualTurnoverMinor: 100000000 },
        technicalValues: {},
        derivedQualityScore: 85,
      },
      {
        bidId: 'bid-e',
        vendorId: 'vendor-e',
        submittedAt: '2026-03-01T10:05:00Z',
        priceMinor: 74000000,
        deliveryDays: 15,
        vendorSnapshot: { experienceYears: 10, annualTurnoverMinor: 150000000 },
        technicalValues: {},
        derivedQualityScore: 100,
      },
    ];

    const hash1 = hashConfig(defaultSnapshot);
    const hash2 = hashConfig(defaultSnapshot);
    expect(hash1).toBe(hash2);

    const run1 = evaluateTenderPure(bids, defaultSnapshot);
    const run2 = evaluateTenderPure(bids, defaultSnapshot);

    expect(run1).toEqual(run2);
  });

  it('Test 15: float weights rejected', () => {
    const floatCriteria: ScoringCriterion[] = [
      { key: 'price', label: 'Price', direction: 'lower', weight: 40.5, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      { key: 'quality', label: 'Quality', direction: 'higher', weight: 29.5, unit: 'score', valueSource: { type: 'DERIVED_QUALITY' } },
      { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
      { key: 'experience', label: 'Experience', direction: 'higher', weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
    ];

    const validation = validateScoringCriteria(floatCriteria);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('positive integer'))).toBe(true);
  });

  // ==========================================
  // Generic Criteria Tests (16–20)
  // ==========================================

  it('Test 16: a 6-criterion tender scores correctly with no engine change', () => {
    const technicalCriteria: TechnicalCriterion[] = [
      {
        key: 'warrantyMonths',
        label: 'Warranty (months)',
        points: 40,
        type: 'numeric',
        direction: 'higher',
        min: 12,
        max: 60,
      },
      {
        key: 'specCompliance',
        label: 'Specification Compliance',
        points: 30,
        type: 'checklist',
        items: [
          { key: 'iso', label: 'ISO 9001', fraction: 0.5 },
          { key: 'cmmi', label: 'CMMI Level 3', fraction: 0.5 },
        ],
      },
      {
        key: 'maintenanceTier',
        label: 'Maintenance Tier',
        points: 30,
        type: 'enum',
        options: [
          { value: 'basic', label: 'Basic', fraction: 0.3 },
          { value: 'standard', label: 'Standard', fraction: 0.7 },
          { value: 'premium', label: 'Premium', fraction: 1.0 },
        ],
      },
    ];

    const sixCriteria: ScoringCriterion[] = [
      { key: 'price', label: 'Price', direction: 'lower', weight: 30, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      { key: 'quality', label: 'Quality', direction: 'higher', weight: 20, unit: 'score', valueSource: { type: 'DERIVED_QUALITY' } },
      { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 15, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
      { key: 'experience', label: 'Experience', direction: 'higher', weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
      { key: 'warranty', label: 'Warranty', direction: 'higher', weight: 15, unit: 'months', valueSource: { type: 'TECHNICAL_VALUE', path: 'warrantyMonths' } },
      { key: 'maintenance', label: 'Maintenance Support', direction: 'higher', weight: 10, unit: 'score', valueSource: { type: 'TECHNICAL_VALUE', path: 'maintenanceTier' } },
    ];

    const snapshot6: TenderConfigSnapshot = {
      ...defaultSnapshot,
      technicalCriteria,
      scoringCriteria: sixCriteria,
    };

    const bids: BidContext[] = [
      {
        bidId: 'bid-g1',
        vendorId: 'vendor-g1',
        submittedAt: '2026-03-01T10:00:00Z',
        priceMinor: 80000000,
        deliveryDays: 20,
        vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
        technicalValues: {
          warrantyMonths: 36,
          specCompliance: ['iso', 'cmmi'],
          maintenanceTier: 'standard',
        },
      },
      {
        bidId: 'bid-g2',
        vendorId: 'vendor-g2',
        submittedAt: '2026-03-01T10:00:00Z',
        priceMinor: 90000000,
        deliveryDays: 25,
        vendorSnapshot: { experienceYears: 7, annualTurnoverMinor: 80000000 },
        technicalValues: {
          warrantyMonths: 60,
          specCompliance: ['iso'],
          maintenanceTier: 'premium',
        },
      },
    ];

    const out = evaluateTenderPure(bids, snapshot6);
    expect(out.summary.outcome).toBe('RANKED');
    expect(out.summary.eligibleCount).toBe(2);
    expect(out.results[0].breakdown).toHaveLength(6);
  });

  it('Test 17: a TECHNICAL_VALUE criterion (warranty) resolves and scores', () => {
    const criterion: ScoringCriterion = {
      key: 'warranty',
      label: 'Warranty',
      direction: 'higher',
      weight: 10,
      unit: 'months',
      valueSource: { type: 'TECHNICAL_VALUE', path: 'warrantyMonths' },
    };

    const technicalCriteria: TechnicalCriterion[] = [
      {
        key: 'warrantyMonths',
        label: 'Warranty',
        type: 'numeric',
        direction: 'higher',
        min: 12,
        max: 60,
        points: 20,
      },
    ];

    const bid: BidContext = {
      bidId: 'bid-w',
      vendorId: 'vendor-w',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 80000000,
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
      technicalValues: { warrantyMonths: 48 },
    };

    const resolved = resolveCriterionValue(criterion, bid, technicalCriteria);
    expect(resolved).toBe(48);
  });

  it('Test 18: an enum criterion coerces via declared fractions', () => {
    const criterion: ScoringCriterion = {
      key: 'maintenance',
      label: 'Maintenance',
      direction: 'higher',
      weight: 10,
      unit: 'score',
      valueSource: { type: 'TECHNICAL_VALUE', path: 'maintenanceTier' },
    };

    const technicalCriteria: TechnicalCriterion[] = [
      {
        key: 'maintenanceTier',
        label: 'Maintenance Tier',
        type: 'enum',
        points: 20,
        options: [
          { value: 'basic', label: 'Basic', fraction: 0.3 },
          { value: 'standard', label: 'Standard', fraction: 0.7 },
          { value: 'premium', label: 'Premium', fraction: 1.0 },
        ],
      },
    ];

    const bidStandard: BidContext = {
      bidId: 'bid-std',
      vendorId: 'vendor-std',
      submittedAt: '2026-03-01T10:00:00Z',
      priceMinor: 80000000,
      deliveryDays: 20,
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 50000000 },
      technicalValues: { maintenanceTier: 'standard' },
    };

    const resolvedStd = resolveCriterionValue(criterion, bidStandard, technicalCriteria);
    expect(resolvedStd).toBe(70); // 0.7 * 100

    const bidPremium: BidContext = {
      ...bidStandard,
      technicalValues: { maintenanceTier: 'premium' },
    };
    const resolvedPrem = resolveCriterionValue(criterion, bidPremium, technicalCriteria);
    expect(resolvedPrem).toBe(100); // 1.0 * 100
  });

  it('Test 19: an unwhitelisted valueSource.path is rejected at tender validation', () => {
    const invalidCriteria: ScoringCriterion[] = [
      { key: 'price', label: 'Price', direction: 'lower', weight: 50, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'unwhitelistedField' as any } },
      { key: 'quality', label: 'Quality', direction: 'higher', weight: 50, unit: 'score', valueSource: { type: 'DERIVED_QUALITY' } },
    ];

    const validation = validateScoringCriteria(invalidCriteria);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('unwhitelisted BID_FIELD path'))).toBe(true);
  });

  it('Test 20: criteria count outside 2–10 rejected', () => {
    // 1 criterion (< 2)
    const singleCriterion: ScoringCriterion[] = [
      { key: 'price', label: 'Price', direction: 'lower', weight: 100, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
    ];
    const valSingle = validateScoringCriteria(singleCriterion);
    expect(valSingle.valid).toBe(false);
    expect(valSingle.errors.some((e) => e.includes('between 2 and 10'))).toBe(true);

    // 11 criteria (> 10)
    const elevenCriteria: ScoringCriterion[] = Array.from({ length: 11 }, (_, i) => ({
      key: `crit_${i}`,
      label: `Criterion ${i}`,
      direction: 'higher',
      weight: i === 0 ? 10 : (i === 1 ? 10 : (i === 2 ? 10 : (i === 3 ? 10 : (i === 4 ? 10 : (i === 5 ? 10 : (i === 6 ? 10 : (i === 7 ? 10 : (i === 8 ? 10 : (i === 9 ? 5 : 5))))))))),
      unit: 'score',
      valueSource: { type: 'DERIVED_QUALITY' },
    }));
    const valEleven = validateScoringCriteria(elevenCriteria);
    expect(valEleven.valid).toBe(false);
    expect(valEleven.errors.some((e) => e.includes('between 2 and 10'))).toBe(true);

    // 4 criteria (within 2-10)
    const valValid = validateScoringCriteria(defaultScoringCriteria);
    expect(valValid.valid).toBe(true);
  });
});
