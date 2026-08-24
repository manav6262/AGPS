/**
 * AGPS Phase 6 Tests: Evaluation Service, Snapshot Evaluation, Repeatability, and Concurrency Locks (SPEC §11, §12, §14.4, §22 Tests 12, 23, 24, 24b, 31)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../app.js';
import { User, VendorProfile, Tender, Bid, Evaluation } from '../../models/index.js';
import { generateAccessToken, hashPassword } from '../../utils/security.js';
import { runTenderEvaluation } from '../../services/evaluationService.js';
import { DEFAULT_PROVENANCE } from '@agps/shared';

let mongoServer: MongoMemoryServer;
let adminToken: string;
let adminId: string;
let vendor1Token: string;
let vendor1Id: string;
let vendor2Token: string;
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
    email: 'admin_eval@gov.in',
    passwordHash: await hashPassword('password123'),
    role: 'ADMIN',
    name: 'Admin Evaluator',
  });
  adminId = admin._id.toString();
  adminToken = generateAccessToken({
    userId: adminId,
    role: 'ADMIN',
    email: admin.email,
    name: admin.name,
  });

  // Create Vendor 1
  const vendor1 = await User.create({
    email: 'vendor1@corp.in',
    passwordHash: await hashPassword('password123'),
    role: 'VENDOR',
    name: 'Alpha Systems',
  });
  vendor1Id = vendor1._id.toString();
  vendor1Token = generateAccessToken({
    userId: vendor1Id,
    role: 'VENDOR',
    email: vendor1.email,
    name: vendor1.name,
  });
  await VendorProfile.create({
    user: vendor1._id,
    companyName: 'Alpha Systems Pvt Ltd',
    registrationNo: 'REG-ALPHA-01',
    gstin: '07AAAAA1111A1Z1',
    address: 'Delhi',
    contactPhone: '9876543210',
    experienceYears: 5,
    annualTurnoverMinor: 6000000000,
    isBlacklisted: false,
    provenance: { ...DEFAULT_PROVENANCE },
  });

  // Create Vendor 2
  const vendor2 = await User.create({
    email: 'vendor2@corp.in',
    passwordHash: await hashPassword('password123'),
    role: 'VENDOR',
    name: 'Beta Infotech',
  });
  vendor2Id = vendor2._id.toString();
  vendor2Token = generateAccessToken({
    userId: vendor2Id,
    role: 'VENDOR',
    email: vendor2.email,
    name: vendor2.name,
  });
  await VendorProfile.create({
    user: vendor2._id,
    companyName: 'Beta Infotech Pvt Ltd',
    registrationNo: 'REG-BETA-02',
    gstin: '07BBBBB2222B1Z2',
    address: 'Mumbai',
    contactPhone: '9876543211',
    experienceYears: 8,
    annualTurnoverMinor: 9000000000,
    isBlacklisted: false,
    provenance: { ...DEFAULT_PROVENANCE },
  });
});

const defaultValidCriteria = [
  { key: 'price', label: 'Price', direction: 'lower', weight: 40, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
  { key: 'quality', label: 'Quality', direction: 'higher', weight: 30, unit: 'score', valueSource: { type: 'DERIVED_QUALITY' } },
  { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
  { key: 'experience', label: 'Experience', direction: 'higher', weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
];

const defaultEligibilityRules = [
  { code: 'PRICE_BUDGET', field: 'price', operator: 'lte', value: 200000000000, message: 'Price within budget', enabled: true },
  { code: 'EXPERIENCE', field: 'experienceYears', operator: 'gte', value: 1, message: 'Experience valid', enabled: true },
];

describe('AGPS Phase 6 — Evaluation Service Orchestration', () => {
  it('Test 23: evaluation evaluates snapshot, not live tender', async () => {
    // 1. Create and publish tender with standard criteria
    const tender = await Tender.create({
      tenderCode: 'TND-SNAPSHOT-001',
      title: 'Snapshot Test Tender',
      description: 'Desc',
      department: 'IT',
      category: 'Hardware',
      createdBy: adminId,
      status: 'DRAFT',
      startAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 60, maxDeliveryDays: 30, minExperienceYears: 3 },
      eligibilityRules: defaultEligibilityRules,
      scoringCriteria: defaultValidCriteria,
    });

    await request(app)
      .post(`/api/tenders/${tender._id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'PUBLISHED' });

    // Submit bids
    await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendor1Token}`)
      .send({ priceMinor: 60000000, deliveryDays: 10 });

    await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendor2Token}`)
      .send({ priceMinor: 80000000, deliveryDays: 20 });

    const publishedTender = await Tender.findById(tender._id);
    const snapshot = publishedTender!.lockedConfig!;

    // 2. Modify a field directly on the Tender document in MongoDB (e.g. mutate working budget in live document)
    await Tender.updateOne(
      { _id: tender._id },
      {
        $set: {
          'constraints.maxBudgetMinor': 100, // Artificially low budget in working document
        },
      }
    );

    // 3. Run evaluation passing the frozen snapshot
    const evaluation = await runTenderEvaluation({
      tenderId: tender._id,
      configSnapshot: snapshot, // The frozen snapshot is evaluated
      adminId,
    });

    // The evaluation succeeded according to snapshot's rules (not the mutated live tender document)
    expect(evaluation.summary.outcome).toBe('RANKED');
    expect(evaluation.configHash).toBe(snapshot.configHash);
    expect(evaluation.results).toHaveLength(2);
    expect(evaluation.summary.winnerBid).toBeDefined();

    const winnerResult = evaluation.results.find((r) => r.rank === 1);
    expect(winnerResult).toBeDefined();
    expect(winnerResult!.vendorName).toBe('Alpha Systems');
  });

  it('Test 24: deterministic repeat — evaluating twice against unchanged bids produces bit-for-bit identical results & hashes', async () => {
    // 1. Create and publish tender
    const tender = await Tender.create({
      tenderCode: 'TND-DETERMINISM-001',
      title: 'Determinism Test Tender',
      description: 'Desc',
      department: 'IT',
      category: 'Hardware',
      createdBy: adminId,
      status: 'DRAFT',
      startAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 60, maxDeliveryDays: 30, minExperienceYears: 3 },
      eligibilityRules: defaultEligibilityRules,
      scoringCriteria: defaultValidCriteria,
    });

    await request(app)
      .post(`/api/tenders/${tender._id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'PUBLISHED' });

    // Submit bids
    await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendor1Token}`)
      .send({ priceMinor: 60000000, deliveryDays: 10 });

    await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendor2Token}`)
      .send({ priceMinor: 80000000, deliveryDays: 20 });

    const publishedTender = await Tender.findById(tender._id);
    const snapshot = publishedTender!.lockedConfig!;

    // 2. Run evaluation 1
    const eval1 = await runTenderEvaluation({
      tenderId: tender._id,
      configSnapshot: snapshot,
      adminId,
    });

    // 3. Run evaluation 2
    const eval2 = await runTenderEvaluation({
      tenderId: tender._id,
      configSnapshot: snapshot,
      adminId,
    });

    // Both runs must produce bit-for-bit identical results, scores, and ranks
    const res1 = eval1.toObject();
    const res2 = eval2.toObject();

    expect(res1.configHash).toBe(res2.configHash);
    expect(res1.summary.outcome).toBe(res2.summary.outcome);
    expect(res1.summary.winnerBid).toBe(res2.summary.winnerBid);
    expect(res1.summary.winningScore).toBe(res2.summary.winningScore);

    // Assert results arrays are identical in scores, ranks, and breakdown
    expect(res1.results.length).toBe(res2.results.length);
    for (let i = 0; i < res1.results.length; i++) {
      expect(res1.results[i].bidId).toBe(res2.results[i].bidId);
      expect(res1.results[i].finalScore).toBe(res2.results[i].finalScore);
      expect(res1.results[i].rank).toBe(res2.results[i].rank);
      expect(res1.results[i].breakdown).toEqual(res2.results[i].breakdown);
    }
  });

  it('Test 24b: every bid in a tender shares one configVersionAtSubmission and configHashAtSubmission', async () => {
    const tender = await Tender.create({
      tenderCode: 'TND-VERSION-STAMP-001',
      title: 'Config Stamp Tender',
      description: 'Desc',
      department: 'IT',
      category: 'Hardware',
      createdBy: adminId,
      status: 'DRAFT',
      startAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 60, maxDeliveryDays: 30, minExperienceYears: 3 },
      eligibilityRules: defaultEligibilityRules,
      scoringCriteria: defaultValidCriteria,
    });

    await request(app)
      .post(`/api/tenders/${tender._id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'PUBLISHED' });

    // Submit bids
    const b1 = await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendor1Token}`)
      .send({ priceMinor: 60000000, deliveryDays: 10 });

    const b2 = await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendor2Token}`)
      .send({ priceMinor: 80000000, deliveryDays: 20 });

    const published = await Tender.findById(tender._id);
    const expectedVersion = published!.lockedConfig!.version;
    const expectedHash = published!.lockedConfig!.configHash;

    const bid1 = await Bid.findById(b1.body.bid._id);
    const bid2 = await Bid.findById(b2.body.bid._id);

    expect(bid1!.configVersionAtSubmission).toBe(expectedVersion);
    expect(bid1!.configHashAtSubmission).toBe(expectedHash);
    expect(bid2!.configVersionAtSubmission).toBe(expectedVersion);
    expect(bid2!.configHashAtSubmission).toBe(expectedHash);
    expect(bid1!.configHashAtSubmission).toBe(bid2!.configHashAtSubmission);
  });

  it('Test 31: evaluation run twice -> runNumbers 1 and 2, no duplicates; and a concurrent double-run creates exactly ONE evaluation', async () => {
    const tender = await Tender.create({
      tenderCode: 'TND-IDEMPOTENT-001',
      title: 'Idempotent Evaluation Tender',
      description: 'Desc',
      department: 'IT',
      category: 'Hardware',
      createdBy: adminId,
      status: 'DRAFT',
      startAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 60, maxDeliveryDays: 30, minExperienceYears: 3 },
      eligibilityRules: defaultEligibilityRules,
      scoringCriteria: defaultValidCriteria,
    });

    await request(app)
      .post(`/api/tenders/${tender._id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'PUBLISHED' });

    // Submit bid
    await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendor1Token}`)
      .send({ priceMinor: 60000000, deliveryDays: 10 });

    const publishedTender = await Tender.findById(tender._id);
    const snapshot = publishedTender!.lockedConfig!;

    // 1. Sequential double-run creates runNumber 1 and runNumber 2
    const run1 = await runTenderEvaluation({
      tenderId: tender._id,
      configSnapshot: snapshot,
      adminId,
    });
    expect(run1.runNumber).toBe(1);

    const run2 = await runTenderEvaluation({
      tenderId: tender._id,
      configSnapshot: snapshot,
      adminId,
    });
    expect(run2.runNumber).toBe(2);

    // Verify exactly 2 evaluations exist in DB with runNumbers [1, 2]
    const allEvals = await Evaluation.find({ tender: tender._id }).sort({ runNumber: 1 });
    expect(allEvals).toHaveLength(2);
    expect(allEvals.map((e) => e.runNumber)).toEqual([1, 2]);

    // 2. Concurrent double-run: firing two evaluations simultaneously triggers in-process lock on the loser
    const p1 = runTenderEvaluation({
      tenderId: tender._id,
      configSnapshot: snapshot,
      adminId,
    });
    const p2 = runTenderEvaluation({
      tenderId: tender._id,
      configSnapshot: snapshot,
      adminId,
    });

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one concurrent run succeeds and one is rejected with EVALUATION_IN_PROGRESS
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    if (rejected[0].status === 'rejected') {
      expect(rejected[0].reason.message).toContain('EVALUATION_IN_PROGRESS');
    }
  });

  it('Test 12: 0 eligible bids -> evaluation succeeds with outcome NO_ELIGIBLE_VENDORS, no winner selected', async () => {
    // Create tender with strict eligibility rule (e.g. min experience 15 years, which neither vendor has)
    const tender = await Tender.create({
      tenderCode: 'TND-NO-ELIGIBLE-001',
      title: 'Strict Eligibility Tender',
      description: 'Desc',
      department: 'Finance',
      category: 'Consulting',
      createdBy: adminId,
      status: 'DRAFT',
      startAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: {
        maxBudgetMinor: 100000000,
        minQualityScore: 60,
        maxDeliveryDays: 30,
        minExperienceYears: 15,
      },
      eligibilityRules: [
        {
          code: 'MIN_EXPERIENCE',
          field: 'experienceYears',
          operator: 'gte',
          value: 15,
          message: 'Minimum 15 years experience required',
          enabled: true,
        },
      ],
      scoringCriteria: defaultValidCriteria,
    });

    await request(app)
      .post(`/api/tenders/${tender._id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'PUBLISHED' });

    // Submit bids
    await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendor1Token}`)
      .send({ priceMinor: 50000000, deliveryDays: 10 });

    await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendor2Token}`)
      .send({ priceMinor: 60000000, deliveryDays: 12 });

    // Run evaluation
    const evalRes = await request(app)
      .post(`/api/tenders/${tender._id}/evaluate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(evalRes.status).toBe(200);
    const evaluation = evalRes.body.evaluation;

    // Outcome is NO_ELIGIBLE_VENDORS (SPEC §12.6, §14.4, Test 12)
    expect(evaluation.summary.outcome).toBe('NO_ELIGIBLE_VENDORS');
    expect(evaluation.summary.eligibleCount).toBe(0);
    expect(evaluation.summary.rejectedCount).toBe(2);
    expect(evaluation.summary.winnerBid).toBeNull();

    // Verify all bids in results have eligible: false and failedRules recorded
    for (const r of evaluation.results) {
      expect(r.eligible).toBe(false);
      expect(r.rank).toBeUndefined();
      expect(r.failedRules.length).toBeGreaterThan(0);
    }
  });
});
