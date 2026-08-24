/**
 * AGPS Phase 7 Tests: Award, Human Override, Tender Closure, Explainability & Bid Comparison (SPEC §15)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../app.js';
import { User, VendorProfile, Tender, AuditLog } from '../../models/index.js';
import { generateAccessToken, hashPassword } from '../../utils/security.js';
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
    email: 'admin_award@gov.in',
    passwordHash: await hashPassword('password123'),
    role: 'ADMIN',
    name: 'Admin Award Officer',
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
    email: 'vendor1_award@corp.in',
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
    email: 'vendor2_award@corp.in',
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

async function setupEvaluatedTender(): Promise<{ tender: any; bid1Id: string; bid2Id: string }> {
  const tender = await Tender.create({
    tenderCode: `TND-AWARD-${Date.now()}`,
    title: 'Award Lifecycle Tender',
    description: 'Hardware and setup',
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

  // Vendor 1 submits cheaper bid (Rank 1 winner)
  const b1 = await request(app)
    .post(`/api/tenders/${tender._id}/bids`)
    .set('Authorization', `Bearer ${vendor1Token}`)
    .send({ priceMinor: 60000000, deliveryDays: 10 });

  // Vendor 2 submits higher price bid (Rank 2)
  const b2 = await request(app)
    .post(`/api/tenders/${tender._id}/bids`)
    .set('Authorization', `Bearer ${vendor2Token}`)
    .send({ priceMinor: 80000000, deliveryDays: 20 });

  // Run evaluation
  await request(app)
    .post(`/api/tenders/${tender._id}/evaluate`)
    .set('Authorization', `Bearer ${adminToken}`);

  const reloaded = await Tender.findById(tender._id);
  return { tender: reloaded, bid1Id: b1.body.bid._id, bid2Id: b2.body.bid._id };
}

describe('AGPS Phase 7 — Award, Override, Closure, and Explainability', () => {
  it('Winner confirmation updates tender status to WINNER_SELECTED and logs WINNER_CONFIRMED', async () => {
    const { tender } = await setupEvaluatedTender();
    expect(tender.status).toBe('EVALUATED');

    const confirmRes = await request(app)
      .post(`/api/tenders/${tender._id}/award/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.tender.status).toBe('WINNER_SELECTED');

    // Verify audit log
    const auditEvent = await AuditLog.findOne({
      tender: tender._id,
      action: 'WINNER_CONFIRMED',
    });
    expect(auditEvent).toBeDefined();
    expect(auditEvent!.actorRole).toBe('ADMIN');
  });

  it('Human override requires minimum 10 char justification, awards target eligible bid, and logs WINNER_OVERRIDDEN', async () => {
    const { tender, bid2Id } = await setupEvaluatedTender();

    // 1. Rejection on short/missing justification
    const badOverrideRes = await request(app)
      .post(`/api/tenders/${tender._id}/award/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetBidId: bid2Id,
        justification: 'too short', // < 10 chars
      });

    expect(badOverrideRes.status).toBe(400);
    expect(badOverrideRes.body.error).toBe('VALIDATION_ERROR');

    // 2. Valid override with full justification
    const overrideRes = await request(app)
      .post(`/api/tenders/${tender._id}/award/override`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        targetBidId: bid2Id,
        justification: 'Vendor 2 offers better long-term enterprise warranty and support coverage',
      });

    expect(overrideRes.status).toBe(200);
    expect(overrideRes.body.tender.status).toBe('WINNER_SELECTED');

    // Verify audit event
    const auditEvent = await AuditLog.findOne({
      tender: tender._id,
      action: 'WINNER_OVERRIDDEN',
    });
    expect(auditEvent).toBeDefined();
    expect(auditEvent!.payload.overriddenWinnerBidId).toBe(bid2Id);
    expect(auditEvent!.payload.justification).toContain('enterprise warranty');
  });

  it('Tender closure transitions WINNER_SELECTED to CLOSED and logs TENDER_CLOSED', async () => {
    const { tender } = await setupEvaluatedTender();

    // Confirm winner first
    await request(app)
      .post(`/api/tenders/${tender._id}/award/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    // Close tender
    const closeRes = await request(app)
      .post(`/api/tenders/${tender._id}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ closureNotes: 'Procurement cycle completed and contract signed.' });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.tender.status).toBe('CLOSED');

    const auditEvent = await AuditLog.findOne({
      tender: tender._id,
      action: 'TENDER_CLOSED',
    });
    expect(auditEvent).toBeDefined();
    expect(auditEvent!.payload.closureNotes).toContain('contract signed');
  });

  it('GET /api/tenders/:id/explainability returns full scoring criteria, breakdowns, and ranks', async () => {
    const { tender } = await setupEvaluatedTender();

    const reportRes = await request(app)
      .get(`/api/tenders/${tender._id}/explainability`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reportRes.status).toBe(200);
    const report = reportRes.body.report;

    expect(report.tenderCode).toBe(tender.tenderCode);
    expect(report.configHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.scoringCriteria).toHaveLength(4);
    expect(report.results).toHaveLength(2);
    expect(report.results[0].breakdown).toHaveLength(4);
    expect(report.results[0].rank).toBe(1);
    expect(report.results[1].rank).toBe(2);
  });

  it('GET /api/tenders/:id/compare?bidIds=id1,id2 returns side-by-side comparative matrix', async () => {
    const { tender, bid1Id, bid2Id } = await setupEvaluatedTender();

    const compareRes = await request(app)
      .get(`/api/tenders/${tender._id}/compare?bidIds=${bid1Id},${bid2Id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(compareRes.status).toBe(200);
    const comp = compareRes.body.comparison;

    expect(comp.comparedBids).toHaveLength(2);
    expect(comp.criteriaMatrix).toHaveLength(4);

    // Verify matrix rows contain values for both compared bids
    for (const row of comp.criteriaMatrix) {
      expect(row.bids[bid1Id]).toBeDefined();
      expect(row.bids[bid2Id]).toBeDefined();
      expect(typeof row.bids[bid1Id].rawValue).toBe('number');
      expect(typeof row.bids[bid2Id].rawValue).toBe('number');
    }
  });
});
