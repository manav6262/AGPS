/**
 * Seed Script Verification Test (SPEC §24)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { seedDatabase } from '../../seed/index.js';
import { Tender, User, Bid, Evaluation } from '../../models/index.js';
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
  it('Seed script executes cleanly, populates all 5 tenders across lifecycle states, and passes audit chain verification', async () => {
    await seedDatabase(mongoServer.getUri());

    // 1. Verify Users & Roles
    const users = await User.find();
    expect(users).toHaveLength(7); // 1 Admin + 1 Auditor + 5 Vendors
    expect(users.filter((u) => u.role === 'ADMIN')).toHaveLength(1);
    expect(users.filter((u) => u.role === 'AUDITOR')).toHaveLength(1);
    expect(users.filter((u) => u.role === 'VENDOR')).toHaveLength(5);

    // 2. Verify 5 Tenders across states
    const tenders = await Tender.find().sort({ tenderCode: 1 });
    expect(tenders).toHaveLength(5);

    const statuses = tenders.map((t) => t.status);
    expect(statuses).toContain('DRAFT');
    expect(statuses).toContain('PUBLISHED');
    expect(statuses).toContain('BIDDING_OPEN');
    expect(statuses).toContain('EVALUATED');
    expect(statuses).toContain('CLOSED');

    // 3. Verify Bids exist and are linked
    const bids = await Bid.find();
    expect(bids.length).toBeGreaterThanOrEqual(10);

    // 4. Verify Evaluations exist for evaluated and closed tenders
    const evals = await Evaluation.find();
    expect(evals.length).toBeGreaterThanOrEqual(2);

    // 5. Verify Cryptographic Audit Chains for every seeded tender
    for (const tender of tenders) {
      const verification = await verifyAuditChain(tender._id);
      expect(verification.valid).toBe(true);
      expect(verification.totalEntries).toBeGreaterThan(0);
    }
  });
});
