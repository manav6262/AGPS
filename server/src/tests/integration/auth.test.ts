/**
 * AGPS Phase 3 Tests: Auth, Security, IDOR Scoping & Role Enforcement (SPEC §17, §22 Tests 32, 33, 35)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../app.js';
import { User, VendorProfile, Bid, Tender } from '../../models/index.js';
import { hashPassword, generateAccessToken } from '../../utils/security.js';
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

describe('AGPS Phase 3 — Auth and Security', () => {
  const sampleVendorData = {
    email: 'vendor1@testcorp.in',
    password: 'SecurePassword123!',
    name: 'Jane Doe',
    companyName: 'Test Corp Ltd',
    registrationNo: 'REG-99999',
    gstin: '07AAAAA1111A1Z1',
    address: 'Connaught Place, New Delhi',
    contactPhone: '9876543210',
    experienceYears: 5,
    annualTurnoverMinor: 5000000000,
  };

  it('Vendor registration succeeds, hashes password with bcrypt cost 12, sets httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(sampleVendorData);

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('VENDOR');
    expect(res.body.user.email).toBe(sampleVendorData.email.toLowerCase());

    // Check refresh cookie
    const cookies = res.headers['set-cookie'] || [];
    const refreshCookie = cookies.find((c: string) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');

    // Verify bcrypt cost 12 stored in database
    const userInDb = await User.findOne({ email: sampleVendorData.email.toLowerCase() })
      .select('+passwordHash')
      .exec();
    expect(userInDb).toBeDefined();
    // Bcrypt format: $2b$12$... or $2a$12$...
    expect(userInDb!.passwordHash).toMatch(/^\$2[ab]\$12\$/);

    // Verify vendor profile created
    const profileInDb = await VendorProfile.findOne({ user: userInDb!._id });
    expect(profileInDb).toBeDefined();
    expect(profileInDb!.companyName).toBe(sampleVendorData.companyName);
    expect(profileInDb!.provenance.verificationStatus).toBe('UNVERIFIED');
  });

  it('Test 35: Mass assignment fields (role, eligible, verificationStatus) are rejected / stripped by Zod .strict()', async () => {
    const maliciousPayload = {
      ...sampleVendorData,
      email: 'hacker@malicious.in',
      role: 'ADMIN', // Unauthorized attempt to elevate role
      eligible: true, // Evaluative state attempt
      verificationStatus: 'VERIFIED', // Verification status attempt
      isBlacklisted: false,
    };

    const res = await request(app)
      .post('/api/auth/register')
      .send(maliciousPayload);

    // Zod .strict() rejects extra keys with 400 VALIDATION_ERROR
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');

    // Verify no user was created with role ADMIN
    const adminUser = await User.findOne({ email: 'hacker@malicious.in' });
    expect(adminUser).toBeNull();
  });

  it('Login with valid credentials returns access token and refresh cookie; invalid password fails', async () => {
    // Register user first
    await request(app).post('/api/auth/register').send(sampleVendorData);

    // Valid login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: sampleVendorData.email,
        password: sampleVendorData.password,
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.user.email).toBe(sampleVendorData.email.toLowerCase());

    // Invalid password login
    const badLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: sampleVendorData.email,
        password: 'WrongPassword!',
      });

    expect(badLoginRes.status).toBe(401);
    expect(badLoginRes.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('Token refresh rotates access token using valid httpOnly cookie', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(sampleVendorData);
    const cookies = registerRes.headers['set-cookie'];

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
  });

  it('GET /api/auth/me returns authenticated profile with vendor data', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(sampleVendorData);
    const token = registerRes.body.accessToken;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(sampleVendorData.email.toLowerCase());
    expect(meRes.body.vendorProfile.companyName).toBe(sampleVendorData.companyName);
  });

  // ==========================================
  // Test 32: Role-Based Authorization
  // ==========================================

  it('Test 32: Wrong-role requests to admin endpoint return 401/403', async () => {
    // 1. Unauthenticated request -> 401
    const unauthRes = await request(app).get('/api/admin/dashboard');
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.error).toBe('UNAUTHORIZED');

    // 2. Authenticated as VENDOR -> 403
    const vendorUser = await User.create({
      email: 'vendor_role@test.in',
      passwordHash: await hashPassword('password123'),
      role: 'VENDOR',
      name: 'Vendor User',
    });
    const vendorToken = generateAccessToken({
      userId: vendorUser._id.toString(),
      role: 'VENDOR',
      email: vendorUser.email,
      name: vendorUser.name,
    });

    const forbiddenRes = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${vendorToken}`);

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error).toBe('FORBIDDEN');

    // 3. Authenticated as ADMIN -> 200
    const adminUser = await User.create({
      email: 'admin_role@gov.in',
      passwordHash: await hashPassword('password123'),
      role: 'ADMIN',
      name: 'Admin User',
    });
    const adminToken = generateAccessToken({
      userId: adminUser._id.toString(),
      role: 'ADMIN',
      email: adminUser.email,
      name: adminUser.name,
    });

    const successRes = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(successRes.status).toBe(200);
    expect(successRes.body.message).toBe('Welcome Admin');
  });

  // ==========================================
  // Test 33: IDOR Scoping
  // ==========================================

  it('Test 33: IDOR — Vendor A requests Vendor B\'s bid by id -> 404 (ownership-scoped query)', async () => {
    const admin = await User.create({
      email: 'admin_idor@gov.in',
      passwordHash: await hashPassword('password123'),
      role: 'ADMIN',
      name: 'Admin IDOR',
    });

    const vendorA = await User.create({
      email: 'vendor_a@corp.in',
      passwordHash: await hashPassword('password123'),
      role: 'VENDOR',
      name: 'Vendor A',
    });

    const vendorB = await User.create({
      email: 'vendor_b@corp.in',
      passwordHash: await hashPassword('password123'),
      role: 'VENDOR',
      name: 'Vendor B',
    });

    const tender = await Tender.create({
      tenderCode: 'TND-IDOR-001',
      title: 'IDOR Tender',
      description: 'Desc',
      department: 'IT',
      category: 'Hardware',
      createdBy: admin._id,
      status: 'PUBLISHED',
      startAt: new Date(),
      deadlineAt: new Date(Date.now() + 86400000),
      constraints: { maxBudgetMinor: 100000000, minQualityScore: 70, maxDeliveryDays: 30, minExperienceYears: 3 },
    });

    // Create Bid belonging to Vendor B
    const bidB = await Bid.create({
      tender: tender._id,
      vendor: vendorB._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: 'hash_xyz',
      priceMinor: 75000000,
      deliveryDays: { value: 20, provenance: { ...DEFAULT_PROVENANCE } },
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 5000000000, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {},
      derivedQualityScore: 88,
    });

    const tokenA = generateAccessToken({
      userId: vendorA._id.toString(),
      role: 'VENDOR',
      email: vendorA.email,
      name: vendorA.name,
    });

    const tokenB = generateAccessToken({
      userId: vendorB._id.toString(),
      role: 'VENDOR',
      email: vendorB.email,
      name: vendorB.name,
    });

    // Vendor A attempts to read Vendor B's bid by its ID -> Must return 404 (SPEC §17.2, Test 33)
    const idorRes = await request(app)
      .get(`/api/bids/${bidB._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(idorRes.status).toBe(404);
    expect(idorRes.body.error).toBe('NOT_FOUND');

    // Vendor B requests their own bid -> 200 OK
    const ownerRes = await request(app)
      .get(`/api/bids/${bidB._id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.bid._id.toString()).toBe(bidB._id.toString());
  });
});
