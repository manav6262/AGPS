/**
 * AGPS Phase 2 Tests: Persistence Foundations, Provenance & Audit Hash Chain (SPEC §6, §8, §16, Test 36)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  User,
  VendorProfile,
  Tender,
  Bid,
  Evaluation,
  AuditLog,
} from '../../models/index.js';
import { createAuditEvent, verifyAuditChain } from '../../services/auditService.js';
import { buildTenderConfigSnapshot } from '../../services/configSnapshotService.js';
import { hashConfig } from '../../utils/hash.js';
import { canonicalJson } from '../../utils/canonicalJson.js';
import { DEFAULT_PROVENANCE } from '@agps/shared';

let mongoServer: MongoMemoryServer;

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
});

describe('AGPS Phase 2 — Persistence Foundations', () => {
  // ==========================================
  // Canonical Serializer & Config Hash
  // ==========================================

  it('Canonical JSON serializer produces key-sorted deterministic output regardless of key insertion order', () => {
    const objA = { z: 1, a: 'test', m: { b: 2, a: 1 } };
    const objB = { a: 'test', m: { a: 1, b: 2 }, z: 1 };

    expect(JSON.stringify(objA)).not.toBe(JSON.stringify(objB));
    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalJson(objA)).toBe('{"a":"test","m":{"a":1,"b":2},"z":1}');
  });

  it('ConfigHash is identical for equivalent configs and changes when config changes', () => {
    const snapshot1 = buildTenderConfigSnapshot({
      version: 1,
      lockedBy: new Types.ObjectId().toString(),
      constraints: {
        maxBudgetMinor: 100000000,
        minQualityScore: 70,
        maxDeliveryDays: 30,
        minExperienceYears: 3,
      },
      eligibilityRules: [
        { code: 'RULE_1', field: 'price', operator: 'lte', value: 100000000, message: 'Price', enabled: true },
      ],
      technicalCriteria: [],
      scoringCriteria: [
        { key: 'price', label: 'Price', direction: 'lower', weight: 100, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      ],
      tieBreakOrder: ['finalScore', 'bidId'],
    });

    const snapshot2 = { ...snapshot1 };
    expect(snapshot1.configHash).toBe(hashConfig(snapshot2));

    const modifiedSnapshot = {
      ...snapshot1,
      constraints: { ...snapshot1.constraints, minQualityScore: 80 },
    };
    expect(hashConfig(modifiedSnapshot)).not.toBe(snapshot1.configHash);
  });

  // ==========================================
  // Models & Provenance Foundations
  // ==========================================

  it('User model stores user with hashed password and excludes passwordHash by default', async () => {
    const user = new User({
      email: 'admin@gov.in',
      passwordHash: 'bcrypt_hashed_value_123',
      role: 'ADMIN',
      name: 'Chief Procurement Officer',
    });
    await user.save();

    const fetched = await User.findById(user._id).exec();
    expect(fetched).toBeDefined();
    expect(fetched!.email).toBe('admin@gov.in');
    expect(fetched!.passwordHash).toBeUndefined(); // select: false

    const fetchedWithPass = await User.findById(user._id).select('+passwordHash').exec();
    expect(fetchedWithPass!.passwordHash).toBe('bcrypt_hashed_value_123');
  });

  it('VendorProfile embeds Provenance defaults (SELF_REPORTED / UNVERIFIED)', async () => {
    const user = await User.create({
      email: 'vendor1@corp.in',
      passwordHash: 'hash',
      role: 'VENDOR',
      name: 'Vendor One Corp',
    });

    const profile = await VendorProfile.create({
      user: user._id,
      companyName: 'Vendor One Tech Ltd',
      registrationNo: 'REG-12345',
      gstin: '07AAAAA0000A1Z5',
      address: 'New Delhi',
      contactPhone: '9876543210',
      experienceYears: 6,
      annualTurnoverMinor: 8500000000,
      provenance: { ...DEFAULT_PROVENANCE },
    });

    expect(profile.provenance.source).toBe('SELF_REPORTED');
    expect(profile.provenance.verificationStatus).toBe('UNVERIFIED');
    expect(profile.provenance.verifiedBy).toBeNull();
  });

  it('Tender model supports three lock states and stores configHistory', async () => {
    const admin = await User.create({
      email: 'admin2@gov.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      name: 'Admin Two',
    });

    const tender = new Tender({
      tenderCode: 'TND-2026-001',
      title: 'Supply of Server Infrastructure',
      description: 'High performance servers',
      department: 'IT Dept',
      category: 'Hardware',
      createdBy: admin._id,
      status: 'DRAFT',
      startAt: new Date(Date.now() + 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: {
        maxBudgetMinor: 100000000,
        minQualityScore: 70,
        maxDeliveryDays: 30,
        minExperienceYears: 3,
      },
      eligibilityRules: [],
      technicalCriteria: [],
      scoringCriteria: [],
      configLockState: 'UNLOCKED',
    });
    await tender.save();

    expect(tender.configLockState).toBe('UNLOCKED');
    expect(tender.lockedConfig).toBeNull();

    // Transition to SOFT_LOCKED at publish with snapshot v1
    const snapshotV1 = buildTenderConfigSnapshot({
      version: 1,
      lockedBy: admin._id,
      constraints: tender.constraints,
      eligibilityRules: tender.eligibilityRules,
      technicalCriteria: tender.technicalCriteria,
      scoringCriteria: tender.scoringCriteria,
      tieBreakOrder: tender.tieBreakOrder,
    });

    tender.status = 'PUBLISHED';
    tender.configLockState = 'SOFT_LOCKED';
    tender.lockedConfig = snapshotV1;
    tender.configHistory.push(snapshotV1);
    await tender.save();

    expect(tender.configLockState).toBe('SOFT_LOCKED');
    expect(tender.lockedConfig.version).toBe(1);
    expect(tender.configHistory).toHaveLength(1);

    // Transition to HARD_LOCKED upon first bid arrival
    tender.firstBidAt = new Date();
    tender.configLockState = 'HARD_LOCKED';
    tender.lockedConfig.lockState = 'HARD_LOCKED';
    tender.lockedConfig.hardLockedAt = tender.firstBidAt;
    await tender.save();

    const fetched = await Tender.findOne({ _id: tender._id }).exec();
    expect(fetched!.configLockState).toBe('HARD_LOCKED');
    expect(fetched!.firstBidAt).toBeDefined();
  });

  it('Bid model enforces required fields, provenance defaults, and revision tracking', async () => {
    const vendorUser = await User.create({
      email: 'bidder1@corp.in',
      passwordHash: 'hash',
      role: 'VENDOR',
      name: 'Bidder One',
    });

    const admin = await User.create({
      email: 'admin_bid@gov.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      name: 'Admin Bid',
    });

    const tender = await Tender.create({
      tenderCode: 'TND-BID-001',
      title: 'Bid Test Tender',
      description: 'Desc',
      department: 'IT',
      category: 'Hardware',
      createdBy: admin._id,
      status: 'PUBLISHED',
      startAt: new Date(),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: {
        maxBudgetMinor: 50000000,
        minQualityScore: 60,
        maxDeliveryDays: 20,
        minExperienceYears: 2,
      },
    });

    const bid = await Bid.create({
      tender: tender._id,
      vendor: vendorUser._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: 'hash_abc123',
      priceMinor: 45000000,
      deliveryDays: { value: 15, provenance: { ...DEFAULT_PROVENANCE } },
      vendorSnapshot: {
        experienceYears: 4,
        annualTurnoverMinor: 6000000000,
        provenance: { ...DEFAULT_PROVENANCE },
      },
      technicalValues: {},
      derivedQualityScore: 85,
    });

    expect(bid.priceMinor).toBe(45000000);
    expect(bid.deliveryDays.provenance.source).toBe('SELF_REPORTED');
    expect(bid.deliveryDays.provenance.verificationStatus).toBe('UNVERIFIED');
    expect(bid.isLatest).toBe(true);
    expect(bid.revision).toBe(1);
  });

  it('Evaluation model persists atomic evaluation outcome with snapshot copy', async () => {
    const admin = await User.create({
      email: 'admin_eval@gov.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      name: 'Admin Eval',
    });

    const tender = await Tender.create({
      tenderCode: 'TND-EVAL-001',
      title: 'Evaluation Test Tender',
      description: 'Desc',
      department: 'IT',
      category: 'Services',
      createdBy: admin._id,
      status: 'PUBLISHED',
      startAt: new Date(),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: {
        maxBudgetMinor: 50000000,
        minQualityScore: 60,
        maxDeliveryDays: 20,
        minExperienceYears: 2,
      },
    });

    const snapshot = buildTenderConfigSnapshot({
      version: 1,
      lockedBy: admin._id,
      constraints: tender.constraints,
      eligibilityRules: [],
      technicalCriteria: [],
      scoringCriteria: [
        { key: 'price', label: 'Price', direction: 'lower', weight: 100, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
      ],
      tieBreakOrder: ['finalScore', 'bidId'],
    });

    const evaluation = await Evaluation.create({
      tender: tender._id,
      runNumber: 1,
      evaluatedBy: admin._id,
      evaluatedAt: new Date(),
      configSnapshot: snapshot,
      configHash: snapshot.configHash,
      durationMs: 4.25,
      provenanceSummary: {
        allSelfReported: true,
        verifiedFieldCount: 0,
        totalFieldCount: 10,
        overallStatus: 'UNVERIFIED',
      },
      summary: {
        totalBids: 1,
        eligibleCount: 1,
        rejectedCount: 0,
        outcome: 'RANKED',
        winnerBid: 'bid-1',
        winningScore: 100.0,
      },
      results: [
        {
          bidId: 'bid-1',
          vendorId: 'vendor-1',
          eligible: true,
          failedRules: [],
          finalScore: 100.0,
          rank: 1,
          isNonComparative: true,
        },
      ],
    });

    expect(evaluation.runNumber).toBe(1);
    expect(evaluation.configHash).toBe(snapshot.configHash);
    expect(evaluation.summary.outcome).toBe('RANKED');
    expect(evaluation.results[0].rank).toBe(1);
  });

  // ==========================================
  // Audit Log Hash Chain & Test 36 (Gate)
  // ==========================================

  it('AuditLog generates unbroken hash chain across multiple events', async () => {
    const admin = await User.create({
      email: 'admin_audit@gov.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      name: 'Auditor One',
    });

    const tender = await Tender.create({
      tenderCode: 'TND-AUDIT-001',
      title: 'Audit Chain Test Tender',
      description: 'Description',
      department: 'Finance',
      category: 'Services',
      createdBy: admin._id,
      status: 'DRAFT',
      startAt: new Date(),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: {
        maxBudgetMinor: 50000000,
        minQualityScore: 60,
        maxDeliveryDays: 20,
        minExperienceYears: 2,
      },
    });

    // Create seq 1
    const entry1 = await createAuditEvent({
      tenderId: tender._id,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'TENDER_CREATED',
      description: 'Tender draft created',
      payload: { code: 'TND-AUDIT-001' },
    });

    expect(entry1.seq).toBe(1);
    expect(entry1.prevHash).toBe('0'.repeat(64)); // Genesis prevHash

    // Create seq 2
    const entry2 = await createAuditEvent({
      tenderId: tender._id,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'TENDER_PUBLISHED',
      description: 'Tender published to portal',
      payload: { configVersion: 1 },
    });

    expect(entry2.seq).toBe(2);
    expect(entry2.prevHash).toBe(entry1.hash);

    // Create seq 3
    const entry3 = await createAuditEvent({
      tenderId: tender._id,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'BIDDING_OPENED',
      description: 'Bidding period active',
    });

    expect(entry3.seq).toBe(3);
    expect(entry3.prevHash).toBe(entry2.hash);

    // Verify unbroken chain
    const verification = await verifyAuditChain(tender._id);
    expect(verification.valid).toBe(true);
    expect(verification.totalEntries).toBe(3);
  });

  it('Test 36: Audit-chain verification detects a manually mutated entry', async () => {
    const admin = await User.create({
      email: 'admin_tamper@gov.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      name: 'Admin Tamper Test',
    });

    const tender = await Tender.create({
      tenderCode: 'TND-TAMPER-001',
      title: 'Tamper Detection Test Tender',
      description: 'Desc',
      department: 'Defence',
      category: 'Equipment',
      createdBy: admin._id,
      status: 'DRAFT',
      startAt: new Date(),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: {
        maxBudgetMinor: 50000000,
        minQualityScore: 60,
        maxDeliveryDays: 20,
        minExperienceYears: 2,
      },
    });

    // Create 3 valid audit log entries
    await createAuditEvent({
      tenderId: tender._id,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'TENDER_CREATED',
      description: 'Original event 1',
    });

    const entry2 = await createAuditEvent({
      tenderId: tender._id,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'TENDER_PUBLISHED',
      description: 'Original event 2',
    });

    await createAuditEvent({
      tenderId: tender._id,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'BIDDING_OPENED',
      description: 'Original event 3',
    });

    // Verify initial chain is valid
    const initialCheck = await verifyAuditChain(tender._id);
    expect(initialCheck.valid).toBe(true);
    expect(initialCheck.totalEntries).toBe(3);

    // Simulate an attacker directly modifying the MongoDB collection at seq 2
    // Bypassing Mongoose model pre-hooks via native collection driver:
    await mongoose.connection.collection('auditlogs').updateOne(
      { _id: entry2._id },
      { $set: { description: 'TAMPERED DESCRIPTION INJECTED BY ATTACKER' } }
    );

    // Run audit chain verification
    const tamperedCheck = await verifyAuditChain(tender._id);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.brokenSeq).toBe(2);
    expect(tamperedCheck.reason).toContain('ENTRY_CONTENT_MUTATED');
  });

  it('Append-only enforcement at Mongoose model level rejects mutation methods', async () => {
    const admin = await User.create({
      email: 'admin_immut@gov.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      name: 'Admin Immutability',
    });

    const tender = await Tender.create({
      tenderCode: 'TND-IMMUT-001',
      title: 'Immutability Test Tender',
      description: 'Desc',
      department: 'Finance',
      category: 'Services',
      createdBy: admin._id,
      status: 'DRAFT',
      startAt: new Date(),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: {
        maxBudgetMinor: 50000000,
        minQualityScore: 60,
        maxDeliveryDays: 20,
        minExperienceYears: 2,
      },
    });

    const entry = await createAuditEvent({
      tenderId: tender._id,
      actorId: admin._id,
      actorRole: 'ADMIN',
      action: 'TENDER_CREATED',
      description: 'Original event',
    });

    // Mongoose updateOne should be blocked by pre hook
    await expect(
      AuditLog.updateOne({ _id: entry._id }, { description: 'New description' })
    ).rejects.toThrow('AUDIT_LOG_IMMUTABLE');

    // Mongoose deleteOne should be blocked by pre hook
    await expect(
      AuditLog.deleteOne({ _id: entry._id })
    ).rejects.toThrow('AUDIT_LOG_IMMUTABLE');
  });

  it('AuditLog concurrent writes retry on collision, serialize cleanly, and maintain valid chain', async () => {
    const admin = await User.create({
      email: 'admin_concur@gov.in',
      passwordHash: 'hash',
      role: 'ADMIN',
      name: 'Admin Concurrency Test',
    });

    const tender = await Tender.create({
      tenderCode: 'TND-CONCUR-001',
      title: 'Concurrency Audit Test Tender',
      description: 'Desc',
      department: 'IT',
      category: 'Services',
      createdBy: admin._id,
      status: 'PUBLISHED',
      startAt: new Date(),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: {
        maxBudgetMinor: 50000000,
        minQualityScore: 60,
        maxDeliveryDays: 20,
        minExperienceYears: 2,
      },
    });

    const N = 8;
    // Fire N concurrent audit writes for the same tender simultaneously
    const promises = Array.from({ length: N }, (_, i) =>
      createAuditEvent({
        tenderId: tender._id,
        actorId: admin._id,
        actorRole: 'ADMIN',
        action: 'VENDOR_RANKED',
        description: `Concurrent audit event ${i + 1}`,
        payload: { eventIndex: i + 1 },
      })
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(N);

    // Verify all N entries were saved with sequential, unique seq numbers
    const verification = await verifyAuditChain(tender._id);
    expect(verification.valid).toBe(true);
    expect(verification.totalEntries).toBe(N);

    const savedEntries = await AuditLog.find({ tender: tender._id }).sort({ seq: 1 }).exec();
    const seqs = savedEntries.map((e) => e.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
