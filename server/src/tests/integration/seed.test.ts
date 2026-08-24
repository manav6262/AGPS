/**
 * Seed Script Verification Test (SPEC §21, §24)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { seedDatabase } from '../../seed/index.js';
import { Tender, User, Evaluation } from '../../models/index.js';
import { verifyAuditChain } from '../../services/auditService.js';

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

describe('AGPS Phase 8 — Seed Data and Full State Verification', () => {
  it('Seed script executes cleanly, populates all tenders, passes audit chains, and proves weight-flip and 6-criteria generics', async () => {
    await seedDatabase(mongoServer.getUri());

    // 1. Verify Users & Roles
    const users = await User.find();
    expect(users).toHaveLength(7); // 1 Admin + 1 Auditor + 5 Vendors
    expect(users.filter((u) => u.role === 'ADMIN')).toHaveLength(1);
    expect(users.filter((u) => u.role === 'AUDITOR')).toHaveLength(1);
    expect(users.filter((u) => u.role === 'VENDOR')).toHaveLength(5);

    // 2. Verify all seeded tenders
    const tenders = await Tender.find().sort({ tenderCode: 1 });
    expect(tenders.length).toBeGreaterThanOrEqual(7);

    const statuses = tenders.map((t) => t.status);
    expect(statuses).toContain('DRAFT');
    expect(statuses).toContain('PUBLISHED');
    expect(statuses).toContain('BIDDING_OPEN');
    expect(statuses).toContain('EVALUATED');
    expect(statuses).toContain('CLOSED');

    // 3. Verify Proof 1: Weight-Flip Tender Pair (SPEC §21)
    const tenderFlipA = await Tender.findOne({ tenderCode: 'TND-2026-FLIP-A' });
    const tenderFlipB = await Tender.findOne({ tenderCode: 'TND-2026-FLIP-B' });
    expect(tenderFlipA).toBeDefined();
    expect(tenderFlipB).toBeDefined();

    const evalA = await Evaluation.findOne({ tender: tenderFlipA!._id });
    const evalB = await Evaluation.findOne({ tender: tenderFlipB!._id });
    expect(evalA).toBeDefined();
    expect(evalB).toBeDefined();

    const winnerA = evalA!.results.find((r) => r.rank === 1);
    const winnerB = evalB!.results.find((r) => r.rank === 1);

    expect(winnerA!.vendorName).toBe('Tata Advanced Systems');
    expect(winnerB!.vendorName).toBe('Infosys Public Services');
    expect(winnerA!.vendorName).not.toBe(winnerB!.vendorName);

    // 4. Verify Proof 2: 6-Criteria Generic Engine Tender (SPEC §21 / TND-2026-003)
    const tender6Crit = await Tender.findOne({ tenderCode: 'TND-2026-003' });
    expect(tender6Crit).toBeDefined();
    expect(tender6Crit!.scoringCriteria).toHaveLength(6);

    const eval6Crit = await Evaluation.findOne({ tender: tender6Crit!._id });
    expect(eval6Crit).toBeDefined();
    expect(eval6Crit!.results).toHaveLength(3);
    for (const r of eval6Crit!.results) {
      expect(r.breakdown).toHaveLength(6);
      const keys = r.breakdown?.map((b) => b.key);
      expect(keys).toContain('warranty');
      expect(keys).toContain('slaResponse');
    }

    // 5. Verify Cryptographic Audit Chains for every seeded tender
    for (const tender of tenders) {
      const verification = await verifyAuditChain(tender._id);
      expect(verification.valid).toBe(true);
      expect(verification.totalEntries).toBeGreaterThan(0);
    }
  });
});
