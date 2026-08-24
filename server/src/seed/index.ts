/**
 * AGPS Database Seed Script (SPEC §24)
 *
 * Populates MongoDB with realistic, consistent procurement data:
 * - 1 Admin, 1 Auditor, 5 Vendors
 * - 5 Tenders across all lifecycle states (DRAFT, PUBLISHED, BIDDING_OPEN, EVALUATED, CLOSED)
 * - Complete audit hash chains for all events
 */

import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User, VendorProfile, Tender, Bid, Evaluation } from '../models/index.js';
import { hashPassword } from '../utils/security.js';
import { buildTenderConfigSnapshot } from '../services/configSnapshotService.js';
import { createAuditEvent, verifyAuditChain } from '../services/auditService.js';
import { runTenderEvaluation } from '../services/evaluationService.js';
import { confirmWinner, closeTender } from '../services/awardService.js';
import { DEFAULT_PROVENANCE } from '@agps/shared';

const defaultCriteria = [
  { key: 'price', label: 'Price', direction: 'lower' as const, weight: 40, unit: 'INR', valueSource: { type: 'BID_FIELD' as const, path: 'priceMinor' as const } },
  { key: 'quality', label: 'Quality Score', direction: 'higher' as const, weight: 30, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' as const } },
  { key: 'delivery', label: 'Delivery Time', direction: 'lower' as const, weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD' as const, path: 'deliveryDays' as const } },
  { key: 'experience', label: 'Vendor Experience', direction: 'higher' as const, weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD' as const, path: 'experienceYears' as const } },
];

export async function seedDatabase(mongoUri: string = env.MONGODB_URI): Promise<void> {
  console.log('Connecting to MongoDB for seeding:', mongoUri);
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  console.log('Clearing existing collections...');
  await Promise.all([
    User.deleteMany({}),
    VendorProfile.deleteMany({}),
    Tender.deleteMany({}),
    Bid.deleteMany({}),
    Evaluation.deleteMany({}),
  ]);

  // Use native driver to clear auditlogs during database re-seed
  try {
    await mongoose.connection.collection('auditlogs').deleteMany({});
  } catch {
    // Collection might not exist yet
  }

  console.log('1. Creating Users & Vendor Profiles...');
  const adminPasswordHash = await hashPassword('AdminPassword123!');
  const auditorPasswordHash = await hashPassword('AuditorPassword123!');
  const vendorPasswordHash = await hashPassword('VendorPassword123!');

  const admin = await User.create({
    email: 'admin@agps.gov.in',
    passwordHash: adminPasswordHash,
    role: 'ADMIN',
    name: 'Rajesh Kumar (Chief Procurement Officer)',
  });

  await User.create({
    email: 'auditor@cag.gov.in',
    passwordHash: auditorPasswordHash,
    role: 'AUDITOR',
    name: 'Suresh Sharma (Principal Auditor, CAG)',
  });

  const vendorsData = [
    { email: 'vendor1@tatacomm.in', name: 'Tata Advanced Systems', reg: 'REG-TAT-01', gstin: '27AAACT2727Q1ZW', exp: 12, turnover: 85000000000, blacklisted: false },
    { email: 'vendor2@infosys.in', name: 'Infosys Public Services', reg: 'REG-INF-02', gstin: '29AAACI4444A1ZA', exp: 15, turnover: 120000000000, blacklisted: false },
    { email: 'vendor3@lnttech.in', name: 'L&T Technology Services', reg: 'REG-LNT-03', gstin: '27AAACL3333L1Z8', exp: 10, turnover: 65000000000, blacklisted: false },
    { email: 'vendor4@wipro.in', name: 'Wipro Infrastructure', reg: 'REG-WIP-04', gstin: '29AAACW5555W1ZY', exp: 8, turnover: 45000000000, blacklisted: false },
    { email: 'vendor5@bel.co.in', name: 'Bharat Electronics Ltd', reg: 'REG-BEL-05', gstin: '29AAACB1111B1Z2', exp: 20, turnover: 95000000000, blacklisted: false },
  ];

  const vendorUsers: any[] = [];
  const vendorProfiles: any[] = [];

  for (const v of vendorsData) {
    const user = await User.create({
      email: v.email,
      passwordHash: vendorPasswordHash,
      role: 'VENDOR',
      name: v.name,
    });
    vendorUsers.push(user);

    const profile = await VendorProfile.create({
      user: user._id,
      companyName: v.name,
      registrationNo: v.reg,
      gstin: v.gstin,
      address: 'Industrial Area, Phase II, New Delhi',
      contactPhone: '9811223344',
      experienceYears: v.exp,
      annualTurnoverMinor: v.turnover,
      isBlacklisted: v.blacklisted,
      provenance: { ...DEFAULT_PROVENANCE },
    });
    vendorProfiles.push(profile);
  }

  console.log('2. Creating Tenders across 5 Lifecycle States...');

  // ==========================================
  // Tender 1: DRAFT (UNLOCKED)
  // ==========================================
  const tender1 = await Tender.create({
    tenderCode: 'TND-2026-MED01',
    title: 'Medical Diagnostic Equipment Supply',
    description: 'Procurement of high-precision MRI and CT Scan systems for new AIIMS facility',
    department: 'Ministry of Health & Family Welfare',
    category: 'Medical Equipment',
    createdBy: admin._id,
    status: 'DRAFT',
    configLockState: 'UNLOCKED',
    startAt: new Date(Date.now() + 86400000),
    deadlineAt: new Date(Date.now() + 86400000 * 30),
    constraints: {
      maxBudgetMinor: 15000000000, // 15 Crore INR
      minQualityScore: 75,
      maxDeliveryDays: 60,
      minExperienceYears: 5,
    },
    scoringCriteria: defaultCriteria,
    firstBidAt: null,
  });

  await createAuditEvent({
    tenderId: tender1._id,
    actorId: admin._id,
    actorRole: 'ADMIN',
    action: 'TENDER_CREATED',
    description: 'Draft tender created for Medical Diagnostic Equipment',
    payload: { tenderCode: tender1.tenderCode },
  });

  // ==========================================
  // Tender 2: PUBLISHED (SOFT_LOCKED, 0 bids)
  // ==========================================
  const snapshot2 = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: {
      maxBudgetMinor: 25000000000, // 25 Crore INR
      minQualityScore: 80,
      maxDeliveryDays: 90,
      minExperienceYears: 8,
    },
    scoringCriteria: defaultCriteria,
    tieBreakOrder: ['derivedQualityScore', 'priceMinor', 'deliveryDays', 'vendorExperience', 'bidId'],
  });

  const tender2 = await Tender.create({
    tenderCode: 'TND-2026-IT02',
    title: 'Government Cloud Infrastructure Migration',
    description: 'Migration of state data centers to hybrid cloud infrastructure with 99.99% SLA',
    department: 'National Informatics Centre (NIC)',
    category: 'Information Technology',
    createdBy: admin._id,
    status: 'PUBLISHED',
    configLockState: 'SOFT_LOCKED',
    lockedConfig: snapshot2,
    configHistory: [snapshot2],
    startAt: new Date(Date.now() + 3600000),
    deadlineAt: new Date(Date.now() + 86400000 * 20),
    constraints: snapshot2.constraints,
    scoringCriteria: defaultCriteria,
    firstBidAt: null,
  });

  await createAuditEvent({
    tenderId: tender2._id,
    actorId: admin._id,
    actorRole: 'ADMIN',
    action: 'TENDER_CREATED',
    description: 'Tender created: Cloud Infrastructure Migration',
  });
  await createAuditEvent({
    tenderId: tender2._id,
    actorId: admin._id,
    actorRole: 'ADMIN',
    action: 'TENDER_PUBLISHED',
    description: 'Tender published with frozen config v1',
    payload: { configHash: snapshot2.configHash },
  });

  // ==========================================
  // Tender 3: BIDDING_OPEN (HARD_LOCKED, 3 Bids)
  // ==========================================
  const snapshot3 = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: {
      maxBudgetMinor: 50000000000, // 50 Crore INR
      minQualityScore: 70,
      maxDeliveryDays: 120,
      minExperienceYears: 5,
    },
    scoringCriteria: defaultCriteria,
    tieBreakOrder: ['derivedQualityScore', 'priceMinor', 'deliveryDays', 'vendorExperience', 'bidId'],
  });

  const tender3 = await Tender.create({
    tenderCode: 'TND-2026-EV03',
    title: 'Electric Bus Fleet & Fast Charging Stations',
    description: 'Procurement of 100 zero-emission electric buses and 20 fast-charging depots',
    department: 'Delhi Transport Corporation (DTC)',
    category: 'Transportation',
    createdBy: admin._id,
    status: 'BIDDING_OPEN',
    configLockState: 'HARD_LOCKED',
    lockedConfig: { ...snapshot3, lockState: 'HARD_LOCKED', hardLockedAt: new Date(Date.now() - 86400000) },
    configHistory: [snapshot3],
    startAt: new Date(Date.now() - 86400000 * 2),
    deadlineAt: new Date(Date.now() + 86400000 * 15),
    constraints: snapshot3.constraints,
    scoringCriteria: defaultCriteria,
    firstBidAt: new Date(Date.now() - 86400000),
  });

  await createAuditEvent({ tenderId: tender3._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: EV Bus Fleet' });
  await createAuditEvent({ tenderId: tender3._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published', payload: { configHash: snapshot3.configHash } });
  await createAuditEvent({ tenderId: tender3._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_OPENED', description: 'Bidding window opened' });

  // Submit 3 bids
  const evBids = [
    { vendor: vendorUsers[0], price: 44000000000, days: 90, quality: 88 },
    { vendor: vendorUsers[2], price: 47500000000, days: 105, quality: 82 },
    { vendor: vendorUsers[3], price: 46000000000, days: 100, quality: 85 },
  ];

  for (const b of evBids) {
    const bid = await Bid.create({
      tender: tender3._id,
      vendor: b.vendor._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: snapshot3.configHash,
      priceMinor: b.price,
      deliveryDays: { value: b.days, provenance: { ...DEFAULT_PROVENANCE } },
      vendorSnapshot: { experienceYears: 10, annualTurnoverMinor: 60000000000, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {},
      derivedQualityScore: b.quality,
    });
    await createAuditEvent({
      tenderId: tender3._id,
      actorId: b.vendor._id,
      actorRole: 'VENDOR',
      action: 'BID_SUBMITTED',
      description: `Bid submitted by ${b.vendor.name}`,
      vendorId: b.vendor._id,
      payload: { bidId: bid._id.toString() },
    });
  }

  // ==========================================
  // Tender 4: EVALUATED (4 Bids Evaluated)
  // ==========================================
  const snapshot4 = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: {
      maxBudgetMinor: 100000000000, // 100 Crore INR
      minQualityScore: 65,
      maxDeliveryDays: 180,
      minExperienceYears: 5,
    },
    scoringCriteria: defaultCriteria,
    tieBreakOrder: ['derivedQualityScore', 'priceMinor', 'deliveryDays', 'vendorExperience', 'bidId'],
  });

  const tender4 = await Tender.create({
    tenderCode: 'TND-2026-SOLAR04',
    title: '50MW Grid-Connected Solar Power Plant',
    description: 'Turnkey EPC contract for design, engineering, procurement, and 5-year O&M of solar facility',
    department: 'NTPC Renewable Energy Ltd',
    category: 'Renewable Energy',
    createdBy: admin._id,
    status: 'BIDDING_CLOSED',
    configLockState: 'HARD_LOCKED',
    lockedConfig: { ...snapshot4, lockState: 'HARD_LOCKED', hardLockedAt: new Date(Date.now() - 86400000 * 5) },
    configHistory: [snapshot4],
    startAt: new Date(Date.now() - 86400000 * 10),
    deadlineAt: new Date(Date.now() - 86400000 * 2),
    constraints: snapshot4.constraints,
    scoringCriteria: defaultCriteria,
    firstBidAt: new Date(Date.now() - 86400000 * 8),
  });

  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: Solar EPC' });
  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published', payload: { configHash: snapshot4.configHash } });
  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_OPENED', description: 'Bidding window opened' });

  // 4 Bids
  const solarBids = [
    { vendor: vendorUsers[0], price: 82000000000, days: 140, quality: 92, exp: 12, turnover: 85000000000 },
    { vendor: vendorUsers[1], price: 89000000000, days: 150, quality: 95, exp: 15, turnover: 120000000000 },
    { vendor: vendorUsers[2], price: 86000000000, days: 135, quality: 86, exp: 10, turnover: 65000000000 },
    { vendor: vendorUsers[3], price: 91000000000, days: 160, quality: 80, exp: 8, turnover: 45000000000 },
  ];

  for (const b of solarBids) {
    const bid = await Bid.create({
      tender: tender4._id,
      vendor: b.vendor._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: snapshot4.configHash,
      priceMinor: b.price,
      deliveryDays: { value: b.days, provenance: { ...DEFAULT_PROVENANCE } },
      vendorSnapshot: { experienceYears: b.exp, annualTurnoverMinor: b.turnover, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {},
      derivedQualityScore: b.quality,
    });
    await createAuditEvent({
      tenderId: tender4._id,
      actorId: b.vendor._id,
      actorRole: 'VENDOR',
      action: 'BID_SUBMITTED',
      description: `Bid submitted by ${b.vendor.name}`,
      vendorId: b.vendor._id,
      payload: { bidId: bid._id.toString() },
    });
  }

  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_CLOSED', description: 'Bidding closed' });
  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'FINANCIAL_BIDS_OPENED', description: 'Financial bids unsealed' });

  // Run pure evaluation on tender 4
  await runTenderEvaluation({
    tenderId: tender4._id,
    configSnapshot: snapshot4,
    adminId: admin._id,
  });

  // ==========================================
  // Tender 5: CLOSED (Full Award & Closure Cycle)
  // ==========================================
  const snapshot5 = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: {
      maxBudgetMinor: 30000000000, // 30 Crore INR
      minQualityScore: 70,
      maxDeliveryDays: 90,
      minExperienceYears: 5,
    },
    scoringCriteria: defaultCriteria,
    tieBreakOrder: ['derivedQualityScore', 'priceMinor', 'deliveryDays', 'vendorExperience', 'bidId'],
  });

  const tender5 = await Tender.create({
    tenderCode: 'TND-2026-CCTV05',
    title: 'Integrated City Surveillance System & Command Centre',
    description: 'Setup of 2000 AI-ready IP CCTV cameras, control room video wall, and data storage for 90 days',
    department: 'Mumbai Smart City Development Corp',
    category: 'Surveillance & Security',
    createdBy: admin._id,
    status: 'BIDDING_CLOSED',
    configLockState: 'HARD_LOCKED',
    lockedConfig: { ...snapshot5, lockState: 'HARD_LOCKED', hardLockedAt: new Date(Date.now() - 86400000 * 20) },
    configHistory: [snapshot5],
    startAt: new Date(Date.now() - 86400000 * 30),
    deadlineAt: new Date(Date.now() - 86400000 * 10),
    constraints: snapshot5.constraints,
    scoringCriteria: defaultCriteria,
    firstBidAt: new Date(Date.now() - 86400000 * 25),
  });

  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: CCTV Surveillance' });
  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published', payload: { configHash: snapshot5.configHash } });
  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_OPENED', description: 'Bidding opened' });

  // 3 Bids for CCTV
  const cctvBids = [
    { vendor: vendorUsers[0], price: 24000000000, days: 60, quality: 90, exp: 12, turnover: 85000000000 },
    { vendor: vendorUsers[2], price: 27000000000, days: 75, quality: 85, exp: 10, turnover: 65000000000 },
    { vendor: vendorUsers[4], price: 29000000000, days: 80, quality: 94, exp: 20, turnover: 95000000000 },
  ];

  for (const b of cctvBids) {
    const bid = await Bid.create({
      tender: tender5._id,
      vendor: b.vendor._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: snapshot5.configHash,
      priceMinor: b.price,
      deliveryDays: { value: b.days, provenance: { ...DEFAULT_PROVENANCE } },
      vendorSnapshot: { experienceYears: b.exp, annualTurnoverMinor: b.turnover, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {},
      derivedQualityScore: b.quality,
    });
    await createAuditEvent({
      tenderId: tender5._id,
      actorId: b.vendor._id,
      actorRole: 'VENDOR',
      action: 'BID_SUBMITTED',
      description: `Bid submitted by ${b.vendor.name}`,
      vendorId: b.vendor._id,
      payload: { bidId: bid._id.toString() },
    });
  }

  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_CLOSED', description: 'Bidding closed' });
  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'FINANCIAL_BIDS_OPENED', description: 'Financial bids unsealed' });

  // Run evaluation on Tender 5
  await runTenderEvaluation({
    tenderId: tender5._id,
    configSnapshot: snapshot5,
    adminId: admin._id,
  });

  // Confirm winner and close tender
  await confirmWinner(tender5._id, admin._id);
  await closeTender(tender5._id, admin._id, 'Procurement cycle completed, contract awarded to Tata Advanced Systems.');

  console.log('3. Verifying Cryptographic Audit Chains for all 5 Seeded Tenders...');
  for (const t of [tender1, tender2, tender3, tender4, tender5]) {
    const check = await verifyAuditChain(t._id);
    if (!check.valid) {
      throw new Error(`Audit chain verification failed for seeded tender ${t.tenderCode}: ${check.reason}`);
    }
    console.log(`✓ Audit chain for ${t.tenderCode} is valid (${check.totalEntries} entries)`);
  }

  console.log('Database seeding successfully completed!');
}

// Direct execution
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv.includes('--run')) {
  seedDatabase()
    .then(() => {
      console.log('Seeding finished. Exiting.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}
