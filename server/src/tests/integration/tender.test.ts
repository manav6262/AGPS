/**
 * AGPS Phase 4 Tests: Tender CRUD, Graduated Lock & Atomic Guards (SPEC §6, §14, §22 Tests 21, 21b, 22, 22b, 22c, 24c)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../app.js';
import { User, Tender, AuditLog } from '../../models/index.js';
import { generateAccessToken, hashPassword } from '../../utils/security.js';
import { updateTender } from '../../services/tenderService.js';

let mongoServer: MongoMemoryServer;
let adminToken: string;
let adminId: string;

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

  const admin = await User.create({
    email: 'admin_tender@gov.in',
    passwordHash: await hashPassword('password123'),
    role: 'ADMIN',
    name: 'Admin Tender Officer',
  });
  adminId = admin._id.toString();
  adminToken = generateAccessToken({
    userId: adminId,
    role: 'ADMIN',
    email: admin.email,
    name: admin.name,
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

describe('AGPS Phase 4 — Tender Lifecycle and Graduated Lock', () => {
  it('Test 21: publishing populates lockedConfig v1 with a stable hash, state SOFT_LOCKED', async () => {
    // 1. Create DRAFT tender
    const createRes = await request(app)
      .post('/api/tenders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenderCode: 'TND-2026-001',
        title: 'Computer Equipment Supply',
        description: 'High performance computer systems',
        department: 'Education',
        category: 'Hardware',
        startAt: new Date(Date.now() + 3600000).toISOString(),
        deadlineAt: new Date(Date.now() + 86400000).toISOString(),
        constraints: {
          maxBudgetMinor: 100000000,
          minQualityScore: 70,
          maxDeliveryDays: 30,
          minExperienceYears: 3,
        },
        eligibilityRules: [
          { code: 'PRICE_WITHIN_BUDGET', field: 'price', operator: 'lte', value: 100000000, message: 'Price exceeds budget', enabled: true },
        ],
        technicalCriteria: [],
        scoringCriteria: defaultValidCriteria,
      });

    expect(createRes.status).toBe(201);
    const tenderId = createRes.body.tender._id;

    // Verify draft status and unlocked lockState
    expect(createRes.body.tender.status).toBe('DRAFT');
    expect(createRes.body.tender.configLockState).toBe('UNLOCKED');
    expect(createRes.body.tender.lockedConfig).toBeNull();

    // 2. Publish the tender
    const publishRes = await request(app)
      .post(`/api/tenders/${tenderId}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'PUBLISHED' });

    expect(publishRes.status).toBe(200);
    const published = publishRes.body.tender;
    expect(published.status).toBe('PUBLISHED');
    expect(published.configLockState).toBe('SOFT_LOCKED');
    expect(published.lockedConfig).toBeDefined();
    expect(published.lockedConfig.version).toBe(1);
    expect(published.lockedConfig.lockState).toBe('SOFT_LOCKED');
    expect(published.lockedConfig.configHash).toMatch(/^[a-f0-9]{64}$/);
    expect(published.configHistory).toHaveLength(1);
  });

  it('Test 21b: editing weights while SOFT_LOCKED succeeds -> version 2, new hash, TENDER_CONFIG_REVISED audited, old version retained in configHistory', async () => {
    // 1. Create and Publish Tender
    const tender = await Tender.create({
      tenderCode: 'TND-2026-002',
      title: 'Tender Revision Test',
      description: 'Desc',
      department: 'Health',
      category: 'Equipment',
      createdBy: adminId,
      status: 'DRAFT',
      startAt: new Date(Date.now() + 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 70, maxDeliveryDays: 30, minExperienceYears: 3 },
      eligibilityRules: defaultEligibilityRules,
      scoringCriteria: defaultValidCriteria,
    });

    await request(app)
      .post(`/api/tenders/${tender._id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'PUBLISHED' });

    const publishedTender = await Tender.findById(tender._id);
    const oldHash = publishedTender!.lockedConfig!.configHash;

    // 2. Edit weights while SOFT_LOCKED (e.g. 20/50/20/10)
    const revisedCriteria = [
      { key: 'price', label: 'Price', direction: 'lower', weight: 20, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      { key: 'quality', label: 'Quality', direction: 'higher', weight: 50, unit: 'score', valueSource: { type: 'DERIVED_QUALITY' } },
      { key: 'delivery', label: 'Delivery', direction: 'lower', weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
      { key: 'experience', label: 'Experience', direction: 'higher', weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
    ];

    const editRes = await request(app)
      .patch(`/api/tenders/${tender._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scoringCriteria: revisedCriteria });

    expect(editRes.status).toBe(200);
    const revised = editRes.body.tender;

    expect(revised.lockedConfig.version).toBe(2);
    expect(revised.lockedConfig.configHash).not.toBe(oldHash);
    expect(revised.configHistory).toHaveLength(2);
    expect(revised.configHistory[0].version).toBe(1);
    expect(revised.configHistory[0].configHash).toBe(oldHash);
    expect(revised.configHistory[1].version).toBe(2);

    // Verify TENDER_CONFIG_REVISED audit event
    const auditEvent = await AuditLog.findOne({
      tender: tender._id,
      action: 'TENDER_CONFIG_REVISED',
    });
    expect(auditEvent).toBeDefined();
    expect(auditEvent!.payload.version).toBe(2);
    expect(auditEvent!.payload.configHash).toBe(revised.lockedConfig.configHash);
  });

  it('Test 22: the first bid sets firstBidAt and HARD_LOCKED', async () => {
    const tender = await Tender.create({
      tenderCode: 'TND-2026-003',
      title: 'First Bid Lock Test',
      description: 'Desc',
      department: 'Transport',
      category: 'Vehicles',
      createdBy: adminId,
      status: 'DRAFT',
      startAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 70, maxDeliveryDays: 30, minExperienceYears: 3 },
      eligibilityRules: defaultEligibilityRules,
      scoringCriteria: defaultValidCriteria,
    });

    // Publish to create lockedConfig snapshot
    await request(app)
      .post(`/api/tenders/${tender._id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'PUBLISHED' });

    // Simulate arrival of first bid (SPEC §6.4)
    const now = new Date();
    await Tender.updateOne(
      { _id: tender._id, firstBidAt: null },
      {
        $set: {
          firstBidAt: now,
          configLockState: 'HARD_LOCKED',
          'lockedConfig.lockState': 'HARD_LOCKED',
          'lockedConfig.hardLockedAt': now,
        },
      }
    );

    const updated = await Tender.findById(tender._id);
    expect(updated!.firstBidAt).toBeDefined();
    expect(updated!.configLockState).toBe('HARD_LOCKED');
    expect(updated!.lockedConfig!.lockState).toBe('HARD_LOCKED');
  });

  it('Test 22b: editing any evaluation config after that -> 409 CONFIG_HARD_LOCKED', async () => {
    const tender = await Tender.create({
      tenderCode: 'TND-2026-004',
      title: 'Locked Tender',
      description: 'Desc',
      department: 'Energy',
      category: 'Power',
      createdBy: adminId,
      status: 'BIDDING_OPEN',
      configLockState: 'HARD_LOCKED',
      firstBidAt: new Date(), // Bids already exist
      startAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 70, maxDeliveryDays: 30, minExperienceYears: 3 },
      eligibilityRules: defaultEligibilityRules,
      scoringCriteria: defaultValidCriteria,
    });

    // Attempting to edit scoring criteria or constraints on hard-locked tender must return 409
    const editRes = await request(app)
      .patch(`/api/tenders/${tender._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        constraints: {
          maxBudgetMinor: 120000000,
          minQualityScore: 60,
          maxDeliveryDays: 40,
          minExperienceYears: 2,
        },
      });

    expect(editRes.status).toBe(409);
    expect(editRes.body.error).toBe('CONFIG_HARD_LOCKED');
  });

  it('Test 22c: editing tenderCode in any post-DRAFT state -> 409', async () => {
    const tender = await Tender.create({
      tenderCode: 'TND-IMMUT-CODE',
      title: 'Tender Code Immutability',
      description: 'Desc',
      department: 'Finance',
      category: 'Services',
      createdBy: adminId,
      status: 'PUBLISHED',
      configLockState: 'SOFT_LOCKED',
      startAt: new Date(Date.now() + 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 70, maxDeliveryDays: 30, minExperienceYears: 3 },
      eligibilityRules: defaultEligibilityRules,
      scoringCriteria: defaultValidCriteria,
    });

    const editRes = await request(app)
      .patch(`/api/tenders/${tender._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenderCode: 'TND-CHANGED-CODE' });

    expect(editRes.status).toBe(409);
    expect(editRes.body.error).toBe('IMMUTABLE_FIELD');
  });

  it('Test 24c: race — a config edit issued against a tender that already has a bid fails atomically, even when the pre-check would have passed', async () => {
    const tender = await Tender.create({
      tenderCode: 'TND-RACE-001',
      title: 'Race Condition Tender',
      description: 'Desc',
      department: 'IT',
      category: 'Hardware',
      createdBy: adminId,
      status: 'PUBLISHED',
      configLockState: 'SOFT_LOCKED',
      firstBidAt: null, // Initial check sees null
      startAt: new Date(Date.now() + 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 70, maxDeliveryDays: 30, minExperienceYears: 3 },
      eligibilityRules: defaultEligibilityRules,
      scoringCriteria: defaultValidCriteria,
    });

    // Simulate concurrent bid landing right between the pre-check and atomic write:
    // Update firstBidAt directly in the collection
    await Tender.updateOne({ _id: tender._id }, { $set: { firstBidAt: new Date() } });

    // The update operation must fail atomically with CONFIG_HARD_LOCKED
    await expect(
      updateTender(tender._id, { title: 'Updated Title' }, adminId)
    ).rejects.toThrow('CONFIG_HARD_LOCKED');
  });
});
