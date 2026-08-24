/**
 * Sensitivity & Breakeven Integration Tests (SPEC §13, §14.5, §18)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../app.js';
import { User, VendorProfile, Tender, Bid, Evaluation } from '../../models/index.js';
import { generateAccessToken, hashPassword } from '../../utils/security.js';
import { ScoringCriterion, DEFAULT_PROVENANCE } from '@agps/shared';

let mongoServer: MongoMemoryServer;
let adminToken: string;
let adminId: string;
let auditorToken: string;
let vendorToken: string;
let vendor1Id: string;
let vendor2Id: string;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  // Create Admin
  const admin = await User.create({
    email: 'admin_sens@agps.gov.in',
    passwordHash: await hashPassword('password123'),
    role: 'ADMIN',
    name: 'Admin Sens Officer',
  });
  adminId = admin._id.toString();
  adminToken = generateAccessToken({
    userId: adminId,
    role: 'ADMIN',
    email: admin.email,
    name: admin.name,
  });

  // Create Auditor
  const auditor = await User.create({
    email: 'auditor_sens@agps.gov.in',
    passwordHash: await hashPassword('password123'),
    role: 'AUDITOR',
    name: 'Auditor Sens Officer',
  });
  auditorToken = generateAccessToken({
    userId: auditor._id.toString(),
    role: 'AUDITOR',
    email: auditor.email,
    name: auditor.name,
  });

  // Create Vendor 1
  const vendor1 = await User.create({
    email: 'alpha_sens@vendor.in',
    passwordHash: await hashPassword('password123'),
    role: 'VENDOR',
    name: 'Vendor Alpha',
  });
  vendor1Id = vendor1._id.toString();
  vendorToken = generateAccessToken({
    userId: vendor1Id,
    role: 'VENDOR',
    email: vendor1.email,
    name: vendor1.name,
  });
  await VendorProfile.create({
    user: vendor1._id,
    companyName: 'Vendor Alpha Pvt Ltd',
    registrationNo: 'CIN-ALPHA-01',
    gstin: '27AABCA1234A1Z5',
    address: 'Mumbai',
    contactPhone: '+91 9876543210',
    experienceYears: 5,
    annualTurnoverMinor: 100000000,
    isBlacklisted: false,
    provenance: DEFAULT_PROVENANCE,
  });

  // Create Vendor 2
  const vendor2 = await User.create({
    email: 'beta_sens@vendor.in',
    passwordHash: await hashPassword('password123'),
    role: 'VENDOR',
    name: 'Vendor Beta',
  });
  vendor2Id = vendor2._id.toString();
  await VendorProfile.create({
    user: vendor2._id,
    companyName: 'Vendor Beta Pvt Ltd',
    registrationNo: 'CIN-BETA-02',
    gstin: '27AABCB5678B1Z6',
    address: 'Bengaluru',
    contactPhone: '+91 9876543211',
    experienceYears: 5,
    annualTurnoverMinor: 100000000,
    isBlacklisted: false,
    provenance: DEFAULT_PROVENANCE,
  });
});

async function createEvaluatedTenderWithTwoBids() {
  const tender = await Tender.create({
    tenderCode: 'TND-2026-SENS-01',
    title: 'Sensitivity Demo Tender',
    description: 'Tender for testing sensitivity, breakeven, and CSV reporting',
    department: 'Ministry of IT',
    category: 'Hardware',
    status: 'FINANCIAL_OPEN',
    configLockState: 'HARD_LOCKED',
    startAt: new Date(Date.now() - 3600000),
    deadlineAt: new Date(Date.now() + 86400000),
    firstBidAt: new Date(),
    createdBy: new Types.ObjectId(adminId),
    constraints: {
      maxBudgetMinor: 5000000000,
      minQualityScore: 50,
      maxDeliveryDays: 60,
      minExperienceYears: 2,
    },
    scoringCriteria: [
      { key: 'price', label: 'Price', direction: 'lower', weight: 40, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      { key: 'quality', label: 'Quality', direction: 'higher', weight: 30, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' } },
      { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
      { key: 'experience', label: 'Experience', direction: 'higher', weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
    ],
    eligibilityRules: [
      { code: 'MAX_BUDGET', field: 'price', operator: 'lte', value: 5000000000, message: 'Over budget', enabled: true },
    ],
    lockedConfig: {
      version: 1,
      lockState: 'HARD_LOCKED',
      lockedAt: new Date(),
      lockedBy: adminId,
      hardLockedAt: new Date(),
      engineVersion: '1.0.0',
      rankingMethod: 'SAW',
      normalizationMethod: 'RATIO',
      constraints: {
        maxBudgetMinor: 5000000000,
        minQualityScore: 50,
        maxDeliveryDays: 60,
        minExperienceYears: 2,
      },
      scoringCriteria: [
        { key: 'price', label: 'Price', direction: 'lower', weight: 40, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
        { key: 'quality', label: 'Quality', direction: 'higher', weight: 30, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' } },
        { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
        { key: 'experience', label: 'Experience', direction: 'higher', weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
      ],
      eligibilityRules: [
        { code: 'MAX_BUDGET', field: 'price', operator: 'lte', value: 5000000000, message: 'Over budget', enabled: true },
      ],
      technicalCriteria: [],
      tieBreakOrder: ['derivedQualityScore', 'priceMinor', 'submittedAt'],
      configHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    },
  });

  // Bid 1 (Alpha): Cheap price (₹10L), lower quality (70)
  await Bid.create({
    tender: tender._id,
    vendor: new Types.ObjectId(vendor1Id),
    revision: 1,
    isLatest: true,
    configVersionAtSubmission: 1,
    configHashAtSubmission: tender.lockedConfig.configHash,
    priceMinor: 100000000,
    deliveryDays: { value: 30, provenance: DEFAULT_PROVENANCE },
    vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 100000000, provenance: DEFAULT_PROVENANCE },
    technicalValues: {},
    derivedQualityScore: 70,
    submittedAt: new Date(Date.now() - 3600000),
  });

  // Bid 2 (Beta): Expensive price (₹15L), high quality (95)
  await Bid.create({
    tender: tender._id,
    vendor: new Types.ObjectId(vendor2Id),
    revision: 1,
    isLatest: true,
    configVersionAtSubmission: 1,
    configHashAtSubmission: tender.lockedConfig.configHash,
    priceMinor: 150000000,
    deliveryDays: { value: 30, provenance: DEFAULT_PROVENANCE },
    vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 100000000, provenance: DEFAULT_PROVENANCE },
    technicalValues: {},
    derivedQualityScore: 95,
    submittedAt: new Date(Date.now() - 1800000),
  });

  return tender;
}

describe('AGPS Sensitivity & Breakeven Integration Tests', () => {
  it('1. POST /api/tenders/:id/simulate with different weights returns a different ranking (Weight-Flip)', async () => {
    const tender = await createEvaluatedTenderWithTwoBids();

    // Price-Heavy simulation: 60/10/20/10 -> Alpha (cheaper) should win
    const criteriaPriceHeavy: ScoringCriterion[] = [
      { key: 'price', label: 'Price', direction: 'lower', weight: 60, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      { key: 'quality', label: 'Quality', direction: 'higher', weight: 10, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' } },
      { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
      { key: 'experience', label: 'Experience', direction: 'higher', weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
    ];

    const res1 = await request(app)
      .post(`/api/tenders/${tender._id}/simulate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ criteria: criteriaPriceHeavy })
      .expect(200);

    expect(res1.body.simulation.simulatedResults[0].vendorName).toBe('Vendor Alpha');

    // Quality-Heavy simulation: 10/60/20/10 -> Beta (higher quality) should win
    const criteriaQualityHeavy: ScoringCriterion[] = [
      { key: 'price', label: 'Price', direction: 'lower', weight: 10, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      { key: 'quality', label: 'Quality', direction: 'higher', weight: 60, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' } },
      { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
      { key: 'experience', label: 'Experience', direction: 'higher', weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
    ];

    const res2 = await request(app)
      .post(`/api/tenders/${tender._id}/simulate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ criteria: criteriaQualityHeavy })
      .expect(200);

    expect(res2.body.simulation.simulatedResults[0].vendorName).toBe('Vendor Beta');
  });

  it('2. POST /api/tenders/:id/simulate writes nothing to MongoDB (Strict Read-Only)', async () => {
    const tender = await createEvaluatedTenderWithTwoBids();

    const countBefore = await Evaluation.countDocuments();

    const criteria: ScoringCriterion[] = [
      { key: 'price', label: 'Price', direction: 'lower', weight: 25, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      { key: 'quality', label: 'Quality', direction: 'higher', weight: 25, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' } },
      { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 25, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
      { key: 'experience', label: 'Experience', direction: 'higher', weight: 25, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
    ];

    await request(app)
      .post(`/api/tenders/${tender._id}/simulate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ criteria })
      .expect(200);

    const countAfter = await Evaluation.countDocuments();
    expect(countAfter).toBe(countBefore);
  });

  it('3. POST /api/tenders/:id/simulate and GET breakeven return 403 for VENDOR', async () => {
    const tender = await createEvaluatedTenderWithTwoBids();
    const criteria = tender.scoringCriteria;

    await request(app)
      .post(`/api/tenders/${tender._id}/simulate`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ criteria })
      .expect(403);

    await request(app)
      .get(`/api/tenders/${tender._id}/breakeven`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .expect(403);
  });

  it('4. GET /api/tenders/:id/breakeven returns critical bounds, margin of victory, and deltas', async () => {
    const tender = await createEvaluatedTenderWithTwoBids();

    const res = await request(app)
      .get(`/api/tenders/${tender._id}/breakeven`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(200);

    const { breakeven } = res.body;
    expect(breakeven).toBeDefined();
    expect(breakeven.marginOfVictory).toBeGreaterThan(0);
    expect(breakeven.rank1Winner).toBeDefined();
    expect(breakeven.rank2RunnerUp).toBeDefined();
    expect(breakeven.criticalBounds.length).toBe(4);
    expect(Object.keys(breakeven.breakevenByBid).length).toBe(2);
  });

  it('5. GET /api/tenders/:id/report.csv returns CSV with provenance disclosure', async () => {
    const tender = await createEvaluatedTenderWithTwoBids();

    const res = await request(app)
      .get(`/api/tenders/${tender._id}/report.csv`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Tender Code');
    expect(res.text).toContain('Provenance Source');
    expect(res.text).toContain('Provenance Status');
    expect(res.text).toContain('Vendor Alpha');
    expect(res.text).toContain('Vendor Beta');
  });

  it('6. GET /api/dashboard/summary returns system aggregates', async () => {
    await createEvaluatedTenderWithTwoBids();

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.totalTenders).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.totalVendors).toBe(2);
    expect(res.body.summary.totalBids).toBe(2);
  });
});
