/**
 * AGPS Phase 5 Tests: Bid Submission, Provenance, Revisions, and Two-Envelope Sealing (SPEC §5, §8.5, §14.3, §22 Tests 25, 26, 29, 34, 37)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../app.js';
import { User, VendorProfile, Tender, Bid } from '../../models/index.js';
import { generateAccessToken, hashPassword } from '../../utils/security.js';
import { DEFAULT_PROVENANCE } from '@agps/shared';

let mongoServer: MongoMemoryServer;
let adminToken: string;
let vendorToken: string;
let vendorId: string;
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

  // Create Admin
  const admin = await User.create({
    email: 'admin_bid@gov.in',
    passwordHash: await hashPassword('password123'),
    role: 'ADMIN',
    name: 'Admin Officer',
  });
  adminId = admin._id.toString();
  adminToken = generateAccessToken({
    userId: adminId,
    role: 'ADMIN',
    email: admin.email,
    name: admin.name,
  });

  // Create Vendor
  const vendor = await User.create({
    email: 'vendor_bid@corp.in',
    passwordHash: await hashPassword('password123'),
    role: 'VENDOR',
    name: 'Vendor User',
  });
  vendorId = vendor._id.toString();
  vendorToken = generateAccessToken({
    userId: vendorId,
    role: 'VENDOR',
    email: vendor.email,
    name: vendor.name,
  });

  // Create VendorProfile
  await VendorProfile.create({
    user: vendor._id,
    companyName: 'Apex Solutions Pvt Ltd',
    registrationNo: 'REG-12345',
    gstin: '07AAAAA1111A1Z1',
    address: 'New Delhi',
    contactPhone: '9876543210',
    experienceYears: 6,
    annualTurnoverMinor: 8000000000,
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

async function createAndPublishTender(): Promise<any> {
  const tender = await Tender.create({
    tenderCode: `TND-${Date.now()}`,
    title: 'Test Procurement Tender',
    description: 'Hardware and setup',
    department: 'IT',
    category: 'Hardware',
    createdBy: adminId,
    status: 'DRAFT',
    startAt: new Date(Date.now() - 3600000),
    deadlineAt: new Date(Date.now() + 86400000),
    constraints: { maxBudgetMinor: 100000000, minQualityScore: 60, maxDeliveryDays: 30, minExperienceYears: 3 },
    scoringCriteria: defaultValidCriteria,
  });

  await request(app)
    .post(`/api/tenders/${tender._id}/transition`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ targetStatus: 'PUBLISHED' });

  await request(app)
    .post(`/api/tenders/${tender._id}/transition`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ targetStatus: 'BIDDING_OPEN' });

  return Tender.findById(tender._id);
}

describe('AGPS Phase 5 — Vendors, Bids, and Sealed Envelopes', () => {
  it('Test 25: every vendor-submitted value persists as SELF_REPORTED / UNVERIFIED', async () => {
    const tender = await createAndPublishTender();

    const submitRes = await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        priceMinor: 65000000,
        deliveryDays: 14,
        technicalValues: {
          uptimeGuarantee: 99.9,
          responseTimeHours: 2,
        },
      });

    expect(submitRes.status).toBe(201);
    const bidId = submitRes.body.bid._id;

    const bidInDb = await Bid.findById(bidId);
    expect(bidInDb).toBeDefined();

    // Verify deliveryDays provenance is SELF_REPORTED and UNVERIFIED
    expect(bidInDb!.deliveryDays.provenance.source).toBe('SELF_REPORTED');
    expect(bidInDb!.deliveryDays.provenance.verificationStatus).toBe('UNVERIFIED');

    // Verify technical values provenance
    expect(bidInDb!.technicalValues.uptimeGuarantee.provenance.source).toBe('SELF_REPORTED');
    expect(bidInDb!.technicalValues.uptimeGuarantee.provenance.verificationStatus).toBe('UNVERIFIED');

    // Verify vendor snapshot provenance
    expect(bidInDb!.vendorSnapshot.provenance.verificationStatus).toBe('UNVERIFIED');
  });

  it('Test 26: no code path can set VERIFIED — posting it is stripped/rejected by the Zod schema', async () => {
    const tender = await createAndPublishTender();

    const maliciousPayload = {
      priceMinor: 65000000,
      deliveryDays: 14,
      technicalValues: { responseTimeHours: 2 },
      verificationStatus: 'VERIFIED', // Unauthorized field injection
      verifiedBy: 'MaliciousActor',
    };

    const res = await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send(maliciousPayload);

    // Zod .strict() rejects extra unauthorized keys with 400 VALIDATION_ERROR
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');

    // Verify no bid was created with verificationStatus: 'VERIFIED'
    const anyVerified = await Bid.findOne({ 'deliveryDays.provenance.verificationStatus': 'VERIFIED' });
    expect(anyVerified).toBeNull();
  });

  it('Test 29: duplicate bid -> revision 2, only isLatest evaluated', async () => {
    const tender = await createAndPublishTender();

    // First bid submission (revision 1)
    const bid1Res = await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        priceMinor: 70000000,
        deliveryDays: 20,
      });

    expect(bid1Res.status).toBe(201);
    expect(bid1Res.body.bid.revision).toBe(1);
    expect(bid1Res.body.bid.isLatest).toBe(true);
    const bid1Id = bid1Res.body.bid._id;

    // Resubmission / revision before deadline (revision 2)
    const bid2Res = await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        priceMinor: 65000000,
        deliveryDays: 15,
      });

    expect(bid2Res.status).toBe(201);
    expect(bid2Res.body.bid.revision).toBe(2);
    expect(bid2Res.body.bid.isLatest).toBe(true);

    // Verify bid 1 was marked isLatest: false
    const bid1InDb = await Bid.findById(bid1Id);
    expect(bid1InDb!.isLatest).toBe(false);

    // Only 1 latest bid exists for this vendor and tender
    const latestBids = await Bid.find({ tender: tender._id, vendor: vendorId, isLatest: true });
    expect(latestBids).toHaveLength(1);
    expect(latestBids[0].revision).toBe(2);
  });

  it('Test 34: price sealed during BIDDING_OPEN, even for ADMIN', async () => {
    const tender = await createAndPublishTender();

    // Vendor submits bid with price
    await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        priceMinor: 55000000,
        deliveryDays: 10,
      });

    // Admin queries bids while tender is in BIDDING_OPEN state
    const adminQueryRes = await request(app)
      .get(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminQueryRes.status).toBe(200);
    expect(adminQueryRes.body.bids).toHaveLength(1);

    // Price must be completely sealed/stripped from response for Admin (SPEC §14.3, Test 34)
    const returnedBid = adminQueryRes.body.bids[0];
    expect(returnedBid.priceMinor).toBeUndefined();
    expect(returnedBid.isPriceSealed).toBe(true);

    // Transition tender through BIDDING_CLOSED to FINANCIAL_OPEN
    await request(app)
      .post(`/api/tenders/${tender._id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'BIDDING_CLOSED' });

    await request(app)
      .post(`/api/tenders/${tender._id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStatus: 'FINANCIAL_OPEN' });

    // Now Admin queries bids after financial unsealing
    const unsealedQueryRes = await request(app)
      .get(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(unsealedQueryRes.status).toBe(200);
    expect(unsealedQueryRes.body.bids[0].priceMinor).toBe(55000000);
  });

  it('Test 37: deliveryDays: 0 / priceMinor: 0 rejected', async () => {
    const tender = await createAndPublishTender();

    // 1. Zero priceMinor rejection
    const zeroPriceRes = await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        priceMinor: 0,
        deliveryDays: 10,
      });

    expect(zeroPriceRes.status).toBe(400);
    expect(zeroPriceRes.body.error).toBe('VALIDATION_ERROR');

    // 2. Zero deliveryDays rejection
    const zeroDeliveryRes = await request(app)
      .post(`/api/tenders/${tender._id}/bids`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        priceMinor: 50000000,
        deliveryDays: 0,
      });

    expect(zeroDeliveryRes.status).toBe(400);
    expect(zeroDeliveryRes.body.error).toBe('VALIDATION_ERROR');
  });
});
