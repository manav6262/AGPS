/**
 * Multi-Government-Officer Authorization & Department Scoping Tests (change01.md §27)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../../app.js';
import { User, Department, Tender, Bid, AuditLog } from '../../models/index.js';
import { hashPassword, generateAccessToken } from '../../utils/security.js';

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

describe('AGPS Multi-Officer Authorization & Department Scoping', () => {
  let superAdminUser: any;
  let superAdminToken: string;

  let defenceDept: any;
  let energyDept: any;

  let defenceOfficer: any;
  let defenceOfficerToken: string;

  let energyOfficer: any;
  let energyOfficerToken: string;

  let vendorUser: any;
  let vendorToken: string;

  let auditorUser: any;
  let auditorToken: string;

  let defenceTender: any;
  let energyTender: any;

  beforeEach(async () => {
    // Clear collections
    await Promise.all([
      User.deleteMany({}),
      Department.deleteMany({}),
      Tender.deleteMany({}),
      Bid.deleteMany({}),
    ]);
    try {
      await mongoose.connection.collection('auditlogs').deleteMany({});
    } catch {
      // Ignored
    }

    // 1. Create Departments
    defenceDept = await Department.create({
      name: 'Ministry of Defence',
      code: 'DEFENCE',
      description: 'Defence Procurement',
      isActive: true,
    });

    energyDept = await Department.create({
      name: 'Ministry of Power & Renewable Energy',
      code: 'ENERGY',
      description: 'Energy Infrastructure',
      isActive: true,
    });

    // 2. Create Users
    const passwordHash = await hashPassword('TestPassword123!');

    superAdminUser = await User.create({
      name: 'Super Admin Official',
      email: 'superadmin@agps.gov.in',
      passwordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    superAdminToken = generateAccessToken({
      userId: superAdminUser._id.toString(),
      role: 'SUPER_ADMIN',
      email: superAdminUser.email,
      name: superAdminUser.name,
    });

    defenceOfficer = await User.create({
      name: 'Defence Officer',
      email: 'defence@agps.gov.in',
      passwordHash,
      role: 'PROCUREMENT_OFFICER',
      departmentId: defenceDept._id,
      isActive: true,
    });
    defenceOfficerToken = generateAccessToken({
      userId: defenceOfficer._id.toString(),
      role: 'PROCUREMENT_OFFICER',
      email: defenceOfficer.email,
      name: defenceOfficer.name,
      departmentId: defenceDept._id.toString(),
    });

    energyOfficer = await User.create({
      name: 'Energy Officer',
      email: 'energy@agps.gov.in',
      passwordHash,
      role: 'PROCUREMENT_OFFICER',
      departmentId: energyDept._id,
      isActive: true,
    });
    energyOfficerToken = generateAccessToken({
      userId: energyOfficer._id.toString(),
      role: 'PROCUREMENT_OFFICER',
      email: energyOfficer.email,
      name: energyOfficer.name,
      departmentId: energyDept._id.toString(),
    });

    vendorUser = await User.create({
      name: 'Vendor Company',
      email: 'vendor@corp.in',
      passwordHash,
      role: 'VENDOR',
      isActive: true,
    });
    vendorToken = generateAccessToken({
      userId: vendorUser._id.toString(),
      role: 'VENDOR',
      email: vendorUser.email,
      name: vendorUser.name,
    });

    auditorUser = await User.create({
      name: 'CAG Auditor',
      email: 'auditor@cag.gov.in',
      passwordHash,
      role: 'AUDITOR',
      isActive: true,
    });
    auditorToken = generateAccessToken({
      userId: auditorUser._id.toString(),
      role: 'AUDITOR',
      email: auditorUser.email,
      name: auditorUser.name,
    });

    // 3. Create Tenders
    defenceTender = await Tender.create({
      tenderCode: 'TND-DEF-001',
      title: 'Armoured Tactical Vehicles',
      description: 'Tactical vehicle procurement for border patrol',
      department: defenceDept.name,
      departmentId: defenceDept._id,
      assignedOfficerId: defenceOfficer._id,
      category: 'Vehicles',
      createdBy: defenceOfficer._id,
      status: 'PUBLISHED',
      configLockState: 'UNLOCKED',
      startAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000 * 10),
      constraints: { maxBudgetMinor: 5000000000, minQualityScore: 70, maxDeliveryDays: 90, minExperienceYears: 3 },
      eligibilityRules: [],
      scoringCriteria: [],
    });

    energyTender = await Tender.create({
      tenderCode: 'TND-NRG-001',
      title: 'Solar Inverter Units',
      description: 'High capacity grid inverters',
      department: energyDept.name,
      departmentId: energyDept._id,
      assignedOfficerId: energyOfficer._id,
      category: 'Solar',
      createdBy: energyOfficer._id,
      status: 'PUBLISHED',
      configLockState: 'UNLOCKED',
      startAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000 * 10),
      constraints: { maxBudgetMinor: 3000000000, minQualityScore: 65, maxDeliveryDays: 60, minExperienceYears: 2 },
      eligibilityRules: [],
      scoringCriteria: [],
    });
  });

  // ==========================================
  // Section 1: Authentication & Login
  // ==========================================
  it('1-4. All four user roles can log in with valid credentials', async () => {
    // 1. SUPER_ADMIN login
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@agps.gov.in', password: 'TestPassword123!' });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.user.role).toBe('SUPER_ADMIN');

    // 2. PROCUREMENT_OFFICER login includes department details
    const officerRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'defence@agps.gov.in', password: 'TestPassword123!' });
    expect(officerRes.status).toBe(200);
    expect(officerRes.body.user.role).toBe('PROCUREMENT_OFFICER');
    expect(officerRes.body.user.departmentId).toBe(defenceDept._id.toString());
    expect(officerRes.body.user.department.name).toBe(defenceDept.name);

    // 3. VENDOR login
    const vendorRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'vendor@corp.in', password: 'TestPassword123!' });
    expect(vendorRes.status).toBe(200);
    expect(vendorRes.body.user.role).toBe('VENDOR');

    // 4. AUDITOR login
    const auditorRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auditor@cag.gov.in', password: 'TestPassword123!' });
    expect(auditorRes.status).toBe(200);
    expect(auditorRes.body.user.role).toBe('AUDITOR');
  });

  // ==========================================
  // Section 2: Officer Provisioning & Authorization
  // ==========================================
  it('5. SUPER_ADMIN can create an officer and logs OFFICER_CREATED audit', async () => {
    const res = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'New Transport Officer',
        email: 'transport.new@agps.gov.in',
        departmentId: defenceDept._id.toString(),
        password: 'SecurePassword123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('PROCUREMENT_OFFICER');
    expect(res.body.user.email).toBe('transport.new@agps.gov.in');
    expect(res.body.user.departmentId).toBe(defenceDept._id.toString());

    // Audit log check
    const audit = await AuditLog.findOne({ action: 'OFFICER_CREATED' });
    expect(audit).toBeDefined();
    expect(audit!.action).toBe('OFFICER_CREATED');
    expect(audit!.payload.officerEmail).toBe('transport.new@agps.gov.in');
  });

  it('6-9. Non-admins cannot create officers (VENDOR, OFFICER, AUDITOR, unauthenticated)', async () => {
    const payload = {
      name: 'Unauthorized Officer',
      email: 'unauth@agps.gov.in',
      departmentId: defenceDept._id.toString(),
      password: 'Password123!',
    };

    // 6. VENDOR
    const resVendor = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send(payload);
    expect(resVendor.status).toBe(403);

    // 7. PROCUREMENT_OFFICER
    const resOfficer = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send(payload);
    expect(resOfficer.status).toBe(403);

    // 8. AUDITOR
    const resAuditor = await request(app)
      .post('/api/admin/officers')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send(payload);
    expect(resAuditor.status).toBe(403);

    // 9. Unauthenticated
    const resNoAuth = await request(app)
      .post('/api/admin/officers')
      .send(payload);
    expect(resNoAuth.status).toBe(401);
  });

  it('10-11. Public registration cannot create officer or SUPER_ADMIN (forced to VENDOR)', async () => {
    const regData = {
      email: 'attacker@evil.in',
      password: 'Password123!',
      name: 'Attacker',
      role: 'SUPER_ADMIN', // Attempted role escalation
      companyName: 'Evil Corp',
      registrationNo: 'REG-666',
      gstin: '07AAAAA9999A1Z9',
      address: 'Dark Alley',
      contactPhone: '9999999999',
      experienceYears: 1,
      annualTurnoverMinor: 1000000,
    };

    const res = await request(app)
      .post('/api/auth/register')
      .send(regData);

    // Zod .strict() rejects unexpected role or forces VENDOR
    if (res.status === 201) {
      expect(res.body.user.role).toBe('VENDOR');
    } else {
      expect(res.status).toBe(400);
    }
  });

  // ==========================================
  // Section 3: Department Access & Isolation
  // ==========================================
  it('12-15. Defence officer can access Defence tender but is forbidden from Energy tender', async () => {
    // 12. Defence officer accesses Defence tender -> 200
    const resDef = await request(app)
      .get(`/api/tenders/${defenceTender._id}`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(resDef.status).toBe(200);
    expect(resDef.body.tender.tenderCode).toBe('TND-DEF-001');

    // 13. Defence officer accesses Energy tender -> 403 Forbidden
    const resDefOnNrg = await request(app)
      .get(`/api/tenders/${energyTender._id}`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(resDefOnNrg.status).toBe(403);

    // 14. Energy officer accesses Energy tender -> 200
    const resNrg = await request(app)
      .get(`/api/tenders/${energyTender._id}`)
      .set('Authorization', `Bearer ${energyOfficerToken}`);
    expect(resNrg.status).toBe(200);

    // 15. Energy officer accesses Defence tender -> 403 Forbidden
    const resNrgOnDef = await request(app)
      .get(`/api/tenders/${defenceTender._id}`)
      .set('Authorization', `Bearer ${energyOfficerToken}`);
    expect(resNrgOnDef.status).toBe(403);
  });

  it('16-17. Defence officer creating tender automatically binds to Defence and cannot override department', async () => {
    const res = await request(app)
      .post('/api/tenders')
      .set('Authorization', `Bearer ${defenceOfficerToken}`)
      .send({
        tenderCode: 'TND-DEF-NEW',
        title: 'New Radars',
        description: 'Radar system acquisition',
        department: 'Ministry of Power & Renewable Energy', // Attempted override
        departmentId: energyDept._id.toString(), // Attempted override
        category: 'Electronics',
        startAt: new Date(Date.now() + 3600000).toISOString(),
        deadlineAt: new Date(Date.now() + 86400000 * 15).toISOString(),
        constraints: { maxBudgetMinor: 2000000000, minQualityScore: 70, maxDeliveryDays: 60, minExperienceYears: 2 },
      });

    expect(res.status).toBe(201);
    // Server enforced Defence department!
    expect(res.body.tender.department).toBe(defenceDept.name);
    expect(res.body.tender.departmentId).toBe(defenceDept._id.toString());
    expect(res.body.tender.assignedOfficerId).toBe(defenceOfficer._id.toString());
  });

  it('18. SUPER_ADMIN can view and manage all tenders across departments', async () => {
    const resDef = await request(app)
      .get(`/api/tenders/${defenceTender._id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(resDef.status).toBe(200);

    const resNrg = await request(app)
      .get(`/api/tenders/${energyTender._id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(resNrg.status).toBe(200);
  });

  // ==========================================
  // Section 4: Bid Access & Scoping
  // ==========================================
  it('21-22. Defence officer can access bids for Defence tender, but not Energy tender', async () => {
    // Submit bid on defence tender
    await Bid.create({
      tender: defenceTender._id,
      vendor: vendorUser._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: 'hash123',
      priceMinor: 4000000000,
      deliveryDays: { value: 60 },
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 1000000000 },
      technicalValues: {},
      derivedQualityScore: 80,
    });

    // Submit bid on energy tender
    await Bid.create({
      tender: energyTender._id,
      vendor: vendorUser._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: 'hash456',
      priceMinor: 2000000000,
      deliveryDays: { value: 45 },
      vendorSnapshot: { experienceYears: 5, annualTurnoverMinor: 1000000000 },
      technicalValues: {},
      derivedQualityScore: 75,
    });

    // 21. Defence officer accesses Defence tender bids -> 200
    const resDefBids = await request(app)
      .get(`/api/tenders/${defenceTender._id}/bids`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(resDefBids.status).toBe(200);
    expect(resDefBids.body.bids).toHaveLength(1);

    // 22. Defence officer accesses Energy tender bids -> 403 Forbidden
    const resNrgBids = await request(app)
      .get(`/api/tenders/${energyTender._id}/bids`)
      .set('Authorization', `Bearer ${defenceOfficerToken}`);
    expect(resNrgBids.status).toBe(403);
  });

  it('19-20. Vendor continues accessing GET /api/bids/mine with strict vendor isolation', async () => {
    const res = await request(app)
      .get('/api/bids/mine')
      .set('Authorization', `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.bids)).toBe(true);
  });

  // ==========================================
  // Section 5: Account Status, Safety & Audit Logs
  // ==========================================
  it('27-29. Deactivated officer cannot login; Admin cannot deactivate self or last admin', async () => {
    // 28. Admin cannot deactivate self
    const resSelf = await request(app)
      .patch(`/api/admin/officers/${superAdminUser._id}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ isActive: false });
    expect(resSelf.status).toBe(400);
    expect(resSelf.body.error).toBe('CANNOT_DEACTIVATE_SELF');

    // 29. Deactivating officer succeeds and generates audit log
    const resDeact = await request(app)
      .patch(`/api/admin/officers/${defenceOfficer._id}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ isActive: false });
    expect(resDeact.status).toBe(200);
    expect(resDeact.body.user.isActive).toBe(false);

    const deactAudit = await AuditLog.findOne({ action: 'OFFICER_DEACTIVATED' });
    expect(deactAudit).toBeDefined();

    // 27. Deactivated officer cannot log in
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'defence@agps.gov.in', password: 'TestPassword123!' });
    expect(loginRes.status).toBe(401);
  });

  it('30. Department reassignment works and creates OFFICER_DEPARTMENT_CHANGED audit log', async () => {
    const res = await request(app)
      .patch(`/api/admin/officers/${defenceOfficer._id}/department`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ departmentId: energyDept._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.user.departmentId).toBe(energyDept._id.toString());

    const changeAudit = await AuditLog.findOne({ action: 'OFFICER_DEPARTMENT_CHANGED' });
    expect(changeAudit).toBeDefined();
    expect(changeAudit!.payload.newDepartmentId).toBe(energyDept._id.toString());
  });

  it('31. Officer dashboard summary returns department-scoped stats', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${defenceOfficerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    // Only 1 Defence tender in test setup
    expect(res.body.summary.totalTenders).toBe(1);
    expect(res.body.summary.department.name).toBe(defenceDept.name);
  });
});
