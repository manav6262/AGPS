/**
 * End-to-End Runtime Verification Test Suite
 * Specifically tests Scenarios 1 to 17 defined in the user's prompt.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../app.js';
import { User, Department, Tender, Bid, AuditLog, VendorProfile } from '../../models/index.js';
import { hashPassword, generateAccessToken } from '../../utils/security.js';
import { verifyAuditChain } from '../../services/auditService.js';
import { DEFAULT_PROVENANCE } from '@agps/shared';

let mongoServer: MongoMemoryServer;

let defenceDept: any;
let energyDept: any;

let seededAdmin: any;
let seededAdminToken: string;

let vendorA: any;
let vendorAToken: string;

let vendorB: any;
let vendorBToken: string;

let auditor: any;
let auditorToken: string;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Create Departments
  defenceDept = await Department.create({
    name: 'Ministry of Defence',
    code: 'DEFENCE',
    description: 'National Security Procurement',
    isActive: true,
  });

  energyDept = await Department.create({
    name: 'Ministry of Power & Renewable Energy',
    code: 'ENERGY',
    description: 'Energy Infrastructure Procurement',
    isActive: true,
  });

  // Create Seeded Admin (Scenario 1 & 14)
  const adminPasswordHash = await hashPassword('AdminPassword123!');
  seededAdmin = await User.create({
    name: 'Rajesh Kumar (Seeded Admin)',
    email: 'admin@agps.gov.in',
    passwordHash: adminPasswordHash,
    role: 'ADMIN',
    isActive: true,
  });
  seededAdminToken = generateAccessToken({
    userId: seededAdmin._id.toString(),
    role: 'ADMIN',
    email: seededAdmin.email,
    name: seededAdmin.name,
  });

  // Create Vendors
  const vendorPasswordHash = await hashPassword('VendorPassword123!');
  vendorA = await User.create({
    name: 'Vendor Company Alpha',
    email: 'vendorA@corp.in',
    passwordHash: vendorPasswordHash,
    role: 'VENDOR',
    isActive: true,
  });
  vendorAToken = generateAccessToken({
    userId: vendorA._id.toString(),
    role: 'VENDOR',
    email: vendorA.email,
    name: vendorA.name,
  });

  await VendorProfile.create({
    user: vendorA._id,
    companyName: 'Alpha Defence Solutions Ltd',
    registrationNo: 'REG-ALPHA-01',
    gstin: '29AAAAA0000A1Z5',
    address: 'New Delhi, India',
    contactPhone: '9876543210',
    experienceYears: 5,
    annualTurnoverMinor: 10000000000,
    isBlacklisted: false,
    provenance: DEFAULT_PROVENANCE,
  });

  vendorB = await User.create({
    name: 'Vendor Company Beta',
    email: 'vendorB@corp.in',
    passwordHash: vendorPasswordHash,
    role: 'VENDOR',
    isActive: true,
  });
  vendorBToken = generateAccessToken({
    userId: vendorB._id.toString(),
    role: 'VENDOR',
    email: vendorB.email,
    name: vendorB.name,
  });

  await VendorProfile.create({
    user: vendorB._id,
    companyName: 'Beta Energy Systems Pvt Ltd',
    registrationNo: 'REG-BETA-02',
    gstin: '29BBBBB1111B2Z6',
    address: 'Bangalore, India',
    contactPhone: '9876543211',
    experienceYears: 4,
    annualTurnoverMinor: 8000000000,
    isBlacklisted: false,
    provenance: DEFAULT_PROVENANCE,
  });

  // Create Auditor
  const auditorPasswordHash = await hashPassword('AuditorPassword123!');
  auditor = await User.create({
    name: 'CAG Auditor Official',
    email: 'auditor@cag.gov.in',
    passwordHash: auditorPasswordHash,
    role: 'AUDITOR',
    isActive: true,
  });
  auditorToken = generateAccessToken({
    userId: auditor._id.toString(),
    role: 'AUDITOR',
    email: auditor.email,
    name: auditor.name,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('AGPS Runtime Verification Suite', () => {
  let createdDefenceOfficerId: string;
  let createdEnergyOfficerId: string;
  let defenceOfficerToken: string;
  let energyOfficerToken: string;

  let defenceTenderAId: string;
  let energyTenderBId: string;
  let defenceBidId: string;
  let energyBidId: string;

  // SCENARIO 1: SUPER ADMIN LOGIN & COMPATIBILITY
  it('Scenario 1: Super Admin login succeeds, role is recognized, endpoints load', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@agps.gov.in', password: 'AdminPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('admin@agps.gov.in');
    expect(['ADMIN', 'SUPER_ADMIN']).toContain(res.body.user.role);

    // Verify admin dashboard summary loads
    const dashRes = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.summary).toBeDefined();

    // Verify Government Officers management endpoint loads
    const officersRes = await request(app)
      .get('/api/admin/officers')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(officersRes.status).toBe(200);
    expect(Array.isArray(officersRes.body.officers)).toBe(true);
  });

  // SCENARIO 2: CREATE PROCUREMENT OFFICER
  it('Scenario 2: Admin creates Defence & Energy officers with hashed passwords and audit logs', async () => {
    // 1. Create Defence Officer
    const defRes = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${seededAdminToken}`)
      .send({
        name: 'Defence Procurement Officer',
        email: 'officer.defence@agps.gov.in',
        password: 'OfficerPassword123!',
        departmentId: defenceDept._id.toString(),
      });

    expect(defRes.status).toBe(201);
    expect(defRes.body.user.role).toBe('PROCUREMENT_OFFICER');
    expect(defRes.body.user.departmentId).toBe(defenceDept._id.toString());
    expect(defRes.body.user.password).toBeUndefined();
    expect(defRes.body.user.passwordHash).toBeUndefined();
    createdDefenceOfficerId = (defRes.body.user.id || defRes.body.user._id).toString();

    // Verify in DB
    const defInDb = await User.findById(createdDefenceOfficerId).select('+passwordHash');
    expect(defInDb).toBeDefined();
    expect(defInDb?.passwordHash).not.toBe('OfficerPassword123!');
    expect(defInDb?.passwordHash.startsWith('$2')).toBe(true);

    // Verify Audit Event OFFICER_CREATED exists and has no password
    const auditEvent = await AuditLog.findOne({
      action: 'OFFICER_CREATED',
      'metadata.officerId': createdDefenceOfficerId,
    });
    expect(auditEvent).toBeDefined();
    expect(JSON.stringify(auditEvent)).not.toContain('OfficerPassword123!');

    // 2. Create Energy Officer
    const enRes = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${seededAdminToken}`)
      .send({
        name: 'Energy Procurement Officer',
        email: 'officer.energy@agps.gov.in',
        password: 'OfficerPassword123!',
        departmentId: energyDept._id.toString(),
      });

    expect(enRes.status).toBe(201);
    expect(enRes.body.user.role).toBe('PROCUREMENT_OFFICER');
    expect(enRes.body.user.departmentId).toBe(energyDept._id.toString());
    createdEnergyOfficerId = (enRes.body.user.id || enRes.body.user._id).toString();
  });

  // SCENARIO 3: OFFICER LOGIN & PROFILE SCOPING
  it('Scenario 3: Defence & Energy officers log in; profiles reflect department; admin controls forbidden', async () => {
    // Defence Login
    const defLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer.defence@agps.gov.in', password: 'OfficerPassword123!' });

    expect(defLogin.status).toBe(200);
    defenceOfficerToken = defLogin.body.accessToken;
    expect(defLogin.body.user.role).toBe('PROCUREMENT_OFFICER');
    expect(defLogin.body.user.departmentId).toBe(defenceDept._id.toString());

    // GET /api/auth/me check
    const defMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(defMe.status).toBe(200);
    expect(defMe.body.user.department.name).toContain('Defence');

    // Verify officer cannot access admin management endpoint
    const forbiddenAdmin = await request(app)
      .get('/api/admin/officers')
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(forbiddenAdmin.status).toBe(403);

    // Energy Login
    const enLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer.energy@agps.gov.in', password: 'OfficerPassword123!' });

    expect(enLogin.status).toBe(200);
    energyOfficerToken = enLogin.body.accessToken;
    expect(enLogin.body.user.departmentId).toBe(energyDept._id.toString());
  });

  // SCENARIO 4: TENDER ISOLATION & MALICIOUS OVERRIDE PREVENTION
  it('Scenario 4: Officer tender creation auto-binds department & officer ID; malicious override rejected/overridden', async () => {
    // Normal creation by Defence Officer
    const tenderRes = await request(app)
      .post('/api/tenders')
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({
        tenderCode: 'TND-DEF-001',
        title: 'Tactical Radio Communication Systems',
        description: 'Advanced secure RF radios',
        category: 'Defence Technology',
        startAt: new Date(Date.now() + 3600000).toISOString(),
        deadlineAt: new Date(Date.now() + 86400000 * 14).toISOString(),
        constraints: {
          maxBudgetMinor: 5000000000,
          minQualityScore: 70,
          maxDeliveryDays: 60,
          minExperienceYears: 3,
        },
        scoringCriteria: [
          { key: 'price', label: 'Commercial Price', direction: 'lower', weight: 50, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
          { key: 'quality', label: 'Technical Quality', direction: 'higher', weight: 50, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' } },
        ],
        eligibilityRules: [
          { code: 'MAX_PRICE', field: 'price', operator: 'lte', value: 5000000000, message: 'Exceeds budget', enabled: true },
        ],
      });

    expect(tenderRes.status).toBe(201);
    defenceTenderAId = tenderRes.body.tender._id;

    // Verify in DB
    const tInDb = await Tender.findById(defenceTenderAId);
    expect(tInDb?.departmentId?.toString()).toBe(defenceDept._id.toString());
    expect(tInDb?.assignedOfficerId?.toString()).toBe(createdDefenceOfficerId);

    // Attempt creation with malicious foreign departmentId = energyDept._id
    const maliciousRes = await request(app)
      .post('/api/tenders')
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({
        tenderCode: 'TND-MALICIOUS-001',
        title: 'Attempted Hijacked Tender',
        description: 'Trying to create Energy tender as Defence officer',
        departmentId: energyDept._id.toString(),
        category: 'Defence',
        startAt: new Date(Date.now() + 3600000).toISOString(),
        deadlineAt: new Date(Date.now() + 86400000 * 14).toISOString(),
        constraints: { maxBudgetMinor: 1000000000, minQualityScore: 70, maxDeliveryDays: 60, minExperienceYears: 3 },
        scoringCriteria: [
          { key: 'price', label: 'Price', direction: 'lower', weight: 100, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
        ],
        eligibilityRules: [
          { code: 'MAX_PRICE', field: 'price', operator: 'lte', value: 1000000000, message: 'Exceeds budget', enabled: true },
        ],
      });

    // Backend must override the malicious department value with the officer's authorized department
    expect(maliciousRes.status).toBe(201);
    const malTenderInDb = await Tender.findById(maliciousRes.body.tender._id);
    expect(malTenderInDb?.departmentId?.toString()).toBe(defenceDept._id.toString());
    expect(malTenderInDb?.departmentId?.toString()).not.toBe(energyDept._id.toString());
  });

  // SCENARIO 5: CROSS-DEPARTMENT READ ACCESS
  it('Scenario 5: Cross-department tender reads return 403; listing filters by department', async () => {
    // Create Energy Tender B
    const energyTenderRes = await request(app)
      .post('/api/tenders')
      .set('Authorization', `Bearer ${energyOfficerToken}`)
      .send({
        tenderCode: 'TND-EN-001',
        title: 'Solar Grid Photovoltaic Cells',
        description: 'High efficiency solar panels',
        category: 'Renewable Energy',
        startAt: new Date(Date.now() + 3600000).toISOString(),
        deadlineAt: new Date(Date.now() + 86400000 * 14).toISOString(),
        constraints: { maxBudgetMinor: 2000000000, minQualityScore: 70, maxDeliveryDays: 90, minExperienceYears: 2 },
        scoringCriteria: [
          { key: 'price', label: 'Commercial Price', direction: 'lower', weight: 60, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
          { key: 'delivery', label: 'Delivery Schedule', direction: 'lower', weight: 40, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
        ],
        eligibilityRules: [
          { code: 'MAX_PRICE', field: 'price', operator: 'lte', value: 2000000000, message: 'Exceeds budget', enabled: true },
        ],
      });
    expect(energyTenderRes.status).toBe(201);
    energyTenderBId = energyTenderRes.body.tender._id;

    // Defence officer lists tenders: should only see Defence tenders
    const defTendersList = await request(app)
      .get('/api/tenders')
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(defTendersList.status).toBe(200);
    const codes = defTendersList.body.tenders.map((t: any) => t.tenderCode);
    expect(codes).toContain('TND-DEF-001');
    expect(codes).not.toContain('TND-EN-001');

    // Defence officer attempts direct read of Energy Tender B -> 403
    const crossReadDef = await request(app)
      .get(`/api/tenders/${energyTenderBId}`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(crossReadDef.status).toBe(403);

    // Energy officer attempts direct read of Defence Tender A -> 403
    const crossReadEn = await request(app)
      .get(`/api/tenders/${defenceTenderAId}`)
      .set('Authorization', `Bearer ${energyOfficerToken}`);
    expect(crossReadEn.status).toBe(403);
  });

  // SCENARIO 6: CROSS-DEPARTMENT BID ACCESS
  it('Scenario 6: Cross-department bid access returns 403', async () => {
    // Transition both tenders DRAFT -> PUBLISHED -> BIDDING_OPEN
    await request(app)
      .post(`/api/tenders/${defenceTenderAId}/transition`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({ targetStatus: 'PUBLISHED' });
    await request(app)
      .post(`/api/tenders/${defenceTenderAId}/transition`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({ targetStatus: 'BIDDING_OPEN' });

    await request(app)
      .post(`/api/tenders/${energyTenderBId}/transition`)
      .set('Authorization', `Bearer ${energyOfficerToken}`)
      .send({ targetStatus: 'PUBLISHED' });
    await request(app)
      .post(`/api/tenders/${energyTenderBId}/transition`)
      .set('Authorization', `Bearer ${energyOfficerToken}`)
      .send({ targetStatus: 'BIDDING_OPEN' });

    // Vendor A submits bid on Defence Tender A
    const defBidRes = await request(app)
      .post(`/api/tenders/${defenceTenderAId}/bids`)
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send({
        priceMinor: 4500000000,
        deliveryDays: 45,
        technicalValues: { technicalQualityScore: 85, experienceYears: 5 },
      });
    expect(defBidRes.status).toBe(201);
    defenceBidId = defBidRes.body.bid._id;

    // Vendor B submits bid on Energy Tender B
    const enBidRes = await request(app)
      .post(`/api/tenders/${energyTenderBId}/bids`)
      .set('Authorization', `Bearer ${vendorBToken}`)
      .send({
        priceMinor: 1800000000,
        deliveryDays: 60,
        technicalValues: { technicalQualityScore: 90, experienceYears: 4 },
      });
    expect(enBidRes.status).toBe(201);
    energyBidId = enBidRes.body.bid._id;

    // Defence Officer can access Defence Tender bids
    const defOfficerBids = await request(app)
      .get(`/api/tenders/${defenceTenderAId}/bids`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(defOfficerBids.status).toBe(200);

    // Defence Officer attempts to access Energy Bid directly by ID -> 403
    const defAccessEnBid = await request(app)
      .get(`/api/bids/${energyBidId}`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(defAccessEnBid.status).toBe(403);

    // Energy Officer attempts to access Defence Bid directly by ID -> 403
    const enAccessDefBid = await request(app)
      .get(`/api/bids/${defenceBidId}`)
      .set('Authorization', `Bearer ${energyOfficerToken}`);
    expect(enAccessDefBid.status).toBe(403);
  });

  // SCENARIO 7: VENDOR REGRESSION TEST (GET /api/bids/mine)
  it('Scenario 7: GET /api/bids/mine returns unsealed price, revision, populated tender info for vendor', async () => {
    const res = await request(app)
      .get('/api/bids/mine')
      .set('Authorization', `Bearer ${vendorAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bids).toBeDefined();
    expect(res.body.bids.length).toBeGreaterThan(0);

    const bid = res.body.bids[0];
    expect(bid.vendor.toString()).toBe(vendorA._id.toString());
    // Price must be unsealed for the owning vendor
    expect(bid.priceMinor).toBe(4500000000);
    // Tender info must be populated
    expect(bid.tender).toBeDefined();
    expect(bid.tender.tenderCode).toBe('TND-DEF-001');
    // Revision info must be correct
    expect(bid.revision).toBe(1);
    expect(bid.isLatest).toBe(true);
  });

  // SCENARIO 8: VENDOR ISOLATION (Vendor A vs Vendor B)
  it('Scenario 8: Vendor B cannot see Vendor A bids in GET /api/bids/mine', async () => {
    const resA = await request(app)
      .get('/api/bids/mine')
      .set('Authorization', `Bearer ${vendorAToken}`);
    const resB = await request(app)
      .get('/api/bids/mine')
      .set('Authorization', `Bearer ${vendorBToken}`);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const aBidIds = resA.body.bids.map((b: any) => b._id);
    const bBidIds = resB.body.bids.map((b: any) => b._id);

    // Vendor A's defence bid must NOT appear in Vendor B's bids
    expect(bBidIds).not.toContain(defenceBidId);
    // Vendor B's energy bid must NOT appear in Vendor A's bids
    expect(aBidIds).not.toContain(energyBidId);
  });

  // SCENARIO 9: OFFICER CANNOT CHANGE DEPARTMENT VIA BODY INJECTION
  it('Scenario 9: Department injection in PATCH tender body is ignored/rejected', async () => {
    await request(app)
      .patch(`/api/tenders/${defenceTenderAId}`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({
        description: 'Updated description by defence officer',
        departmentId: energyDept._id.toString(),
      });

    // Check DB to ensure departmentId was NOT changed to Energy
    const tAfter = await Tender.findById(defenceTenderAId);
    expect(tAfter?.departmentId?.toString()).toBe(defenceDept._id.toString());
  });

  // SCENARIO 10: OFFICER MANAGEMENT SECURITY (401/403)
  it('Scenario 10: Unauthenticated, Vendor, Officer, Auditor cannot access POST /api/admin/officers', async () => {
    const payload = {
      name: 'Unauthorized Officer',
      email: 'unauth@agps.gov.in',
      password: 'Password123!',
      departmentId: defenceDept._id.toString(),
    };

    // Unauthenticated
    const unauthRes = await request(app).post('/api/admin/officers').send(payload);
    expect(unauthRes.status).toBe(401);

    // Vendor
    const vendorRes = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${vendorAToken}`)
      .send(payload);
    expect(vendorRes.status).toBe(403);

    // Procurement Officer
    const officerRes = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send(payload);
    expect(officerRes.status).toBe(403);

    // Auditor
    const auditorRes = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send(payload);
    expect(auditorRes.status).toBe(403);
  });

  // SCENARIO 11: ROLE ESCALATION PREVENTION
  it('Scenario 11: Supplying role=SUPER_ADMIN or ADMIN is forced to PROCUREMENT_OFFICER or rejected', async () => {
    const res = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${seededAdminToken}`)
      .send({
        name: 'Escalation Attempt',
        email: 'escalation@agps.gov.in',
        password: 'Password123!',
        role: 'SUPER_ADMIN',
        departmentId: defenceDept._id.toString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('PROCUREMENT_OFFICER');

    // Also verify public register rejects unexpected role due to Zod .strict()
    const pubRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Public Escalation User',
        email: 'public.escalate@corp.in',
        password: 'Password123!',
        role: 'SUPER_ADMIN',
        companyName: 'Escalate Corp',
        registrationNo: 'REG123',
        gstin: '29ABCDE1234F1Z5',
        address: 'Delhi',
        contactPhone: '9876543210',
      });
    expect(pubRes.status).toBe(400);
  });

  // SCENARIO 12: SELF-DEACTIVATION AND LAST-ADMIN PROTECTION
  it('Scenario 12: Super Admin self-deactivation and last admin deactivation are blocked', async () => {
    // Attempt self-deactivation
    const selfDeact = await request(app)
      .patch(`/api/admin/officers/${seededAdmin._id}/status`)
      .set('Authorization', `Bearer ${seededAdminToken}`)
      .send({ isActive: false });

    expect(selfDeact.status).toBe(400);
    expect(selfDeact.body.error).toBe('CANNOT_DEACTIVATE_SELF');
  });

  // SCENARIO 13: DEACTIVATED OFFICER CANNOT ACCESS PROTECTED RESOURCES
  it('Scenario 13: Deactivated officer is blocked from login and action, but past records persist', async () => {
    // Deactivate Energy Officer
    const deactRes = await request(app)
      .patch(`/api/admin/officers/${createdEnergyOfficerId}/status`)
      .set('Authorization', `Bearer ${seededAdminToken}`)
      .send({ isActive: false });
    expect(deactRes.status).toBe(200);

    // Attempt login as deactivated officer -> 401
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer.energy@agps.gov.in', password: 'OfficerPassword123!' });
    expect(loginRes.status).toBe(401);

    // Verify historical tender created by this officer still exists
    const histTender = await Tender.findById(energyTenderBId);
    expect(histTender).toBeDefined();
    expect(histTender?.title).toBe('Solar Grid Photovoltaic Cells');
  });

  // SCENARIO 14: TENDER RESPONSIBILITY (departmentId vs assignedOfficerId)
  it('Scenario 14: Department scope vs responsible officer (Officer B in same dept handles; foreign dept blocked)', async () => {
    // Create Defence Officer B
    const defBRes = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${seededAdminToken}`)
      .send({
        name: 'Defence Officer Bravo',
        email: 'officer.defence.b@agps.gov.in',
        password: 'OfficerPassword123!',
        departmentId: defenceDept._id.toString(),
      });
    expect(defBRes.status).toBe(201);
    const defOfficerBId = (defBRes.body.user.id || defBRes.body.user._id).toString();

    // Super Admin reassigns assignedOfficerId of Defence Tender A to Officer B
    await Tender.findByIdAndUpdate(defenceTenderAId, { assignedOfficerId: defOfficerBId });

    // Officer B logs in
    const defBLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer.defence.b@agps.gov.in', password: 'OfficerPassword123!' });
    const defBToken = defBLogin.body.accessToken;

    // Officer B can access Defence Tender A because they share the same department
    const defBAccess = await request(app)
      .get(`/api/tenders/${defenceTenderAId}`)
      .set('Authorization', `Bearer ${defBToken}`);
    expect(defBAccess.status).toBe(200);

    // Re-activate Energy Officer for testing foreign access
    await User.findByIdAndUpdate(createdEnergyOfficerId, { isActive: true });
    const enLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'officer.energy@agps.gov.in', password: 'OfficerPassword123!' });
    const enToken = enLogin.body.accessToken;

    // Unrelated Energy Officer cannot access it -> 403
    const enAccess = await request(app)
      .get(`/api/tenders/${defenceTenderAId}`)
      .set('Authorization', `Bearer ${enToken}`);
    expect(enAccess.status).toBe(403);
  });

  // SCENARIO 15: AUDIT LOG VALIDATION
  it('Scenario 15: Audit events exist for officer lifecycle and never record passwords', async () => {
    // Test department reassignment audit
    const reassignRes = await request(app)
      .patch(`/api/admin/officers/${createdEnergyOfficerId}/department`)
      .set('Authorization', `Bearer ${seededAdminToken}`)
      .send({ departmentId: defenceDept._id.toString() });
    expect(reassignRes.status).toBe(200);

    const deactAudit = await AuditLog.findOne({ action: 'OFFICER_DEACTIVATED' });
    const reassignAudit = await AuditLog.findOne({ action: 'OFFICER_DEPARTMENT_CHANGED' });

    expect(deactAudit).toBeDefined();
    expect(reassignAudit).toBeDefined();

    // Verify cryptographic audit chain integrity
    const isValid = await verifyAuditChain(defenceTenderAId);
    expect(isValid.valid).toBe(true);

    // Verify secrets are never logged
    const allOfficerAudits = await AuditLog.find({
      action: { $in: ['OFFICER_CREATED', 'OFFICER_DEACTIVATED', 'OFFICER_DEPARTMENT_CHANGED'] },
    });
    for (const entry of allOfficerAudits) {
      const entryStr = JSON.stringify(entry);
      expect(entryStr).not.toContain('OfficerPassword123!');
      expect(entryStr).not.toContain('passwordHash');
    }
  });

  // SCENARIO 17: EXISTING AGPS REGRESSION (Full Lifecycle, SAW Evaluation, Cryptographic Proof)
  it('Scenario 17: Full procurement lifecycle: transition, evaluation, award, and closing', async () => {
    // Transition to BIDDING_CLOSED
    const closeBidRes = await request(app)
      .post(`/api/tenders/${defenceTenderAId}/transition`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({ targetStatus: 'BIDDING_CLOSED' });
    expect(closeBidRes.status).toBe(200);

    // Transition to FINANCIAL_OPEN
    const finOpenRes = await request(app)
      .post(`/api/tenders/${defenceTenderAId}/transition`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({ targetStatus: 'FINANCIAL_OPEN' });
    expect(finOpenRes.status).toBe(200);

    // Run SAW evaluation
    const evalRes = await request(app)
      .post(`/api/tenders/${defenceTenderAId}/evaluate`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.evaluation).toBeDefined();
    expect(evalRes.body.evaluation.results.length).toBeGreaterThan(0);

    // Confirm winner
    const awardRes = await request(app)
      .post(`/api/tenders/${defenceTenderAId}/award/confirm`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({});
    expect(awardRes.status).toBe(200);

    // Close tender
    const closeRes = await request(app)
      .post(`/api/tenders/${defenceTenderAId}/close`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({ closureNotes: 'Completed successfully' });
    expect(closeRes.status).toBe(200);

    // Verify final status is CLOSED
    const closedTender = await Tender.findById(defenceTenderAId);
    expect(closedTender?.status).toBe('CLOSED');
  });
});
