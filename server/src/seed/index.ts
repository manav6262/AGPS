/**
 * AGPS Database Seed Script (SPEC §21, §24)
 *
 * Populates MongoDB with comprehensive procurement demonstration data:
 * - 1 Admin, 1 Auditor, 5 Vendors
 * - 5 Lifecycle State Tenders (DRAFT, PUBLISHED, BIDDING_OPEN, EVALUATED, CLOSED)
 * - 2 Proof Tenders:
 *   1. Weight-Flip Pair (TND-2026-FLIP-A & TND-2026-FLIP-B): 40/30/20/10 vs 20/50/20/10 flipping winner on identical bids
 *   2. 6-Criteria Tender (TND-2026-003): generic multi-criteria with TECHNICAL_VALUE sources
 * - Complete, unbroken cryptographic audit chains for all seeded tenders
 */

import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User, VendorProfile, Tender, Bid, Evaluation } from '../models/index.js';
import { hashPassword } from '../utils/security.js';
import { buildTenderConfigSnapshot } from '../services/configSnapshotService.js';
import { createAuditEvent, verifyAuditChain } from '../services/auditService.js';
import { runTenderEvaluation } from '../services/evaluationService.js';
import { confirmWinner, closeTender } from '../services/awardService.js';
import { DEFAULT_PROVENANCE, EligibilityRule } from '@agps/shared';

const baseEligibilityRules: EligibilityRule[] = [
  {
    code: 'PRICE_WITHIN_BUDGET',
    field: 'price',
    operator: 'lte',
    value: 200000000000, // 200 Cr default upper bound
    message: 'Bid price exceeds allocated maximum budget',
    enabled: true,
  },
  {
    code: 'MIN_EXPERIENCE_YEARS',
    field: 'experienceYears',
    operator: 'gte',
    value: 3,
    message: 'Vendor has insufficient years of experience',
    enabled: true,
  },
  {
    code: 'NOT_BLACKLISTED',
    field: 'vendorBlacklisted',
    operator: 'isFalse',
    value: false,
    message: 'Vendor is blacklisted from government procurement',
    enabled: true,
  },
];

const standardCriteria = [
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
  for (const v of vendorsData) {
    const user = await User.create({
      email: v.email,
      passwordHash: vendorPasswordHash,
      role: 'VENDOR',
      name: v.name,
    });
    vendorUsers.push(user);

    await VendorProfile.create({
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
  }

  console.log('2. Creating 5 Lifecycle State Demo Tenders...');

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
    constraints: { maxBudgetMinor: 15000000000, minQualityScore: 75, maxDeliveryDays: 60, minExperienceYears: 5 },
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: standardCriteria,
    firstBidAt: null,
  });
  await createAuditEvent({ tenderId: tender1._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Draft created: Medical Diagnostic Equipment' });

  // ==========================================
  // Tender 2: PUBLISHED (SOFT_LOCKED, 0 bids)
  // ==========================================
  const snapshot2 = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: { maxBudgetMinor: 25000000000, minQualityScore: 80, maxDeliveryDays: 90, minExperienceYears: 8 },
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: standardCriteria,
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
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: standardCriteria,
    firstBidAt: null,
  });
  await createAuditEvent({ tenderId: tender2._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: Cloud Infrastructure Migration' });
  await createAuditEvent({ tenderId: tender2._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published with frozen config v1', payload: { configHash: snapshot2.configHash } });

  // ==========================================
  // Tender 3: BIDDING_OPEN (HARD_LOCKED, 3 Bids)
  // ==========================================
  const snapshot3 = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: { maxBudgetMinor: 50000000000, minQualityScore: 70, maxDeliveryDays: 120, minExperienceYears: 5 },
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: standardCriteria,
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
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: standardCriteria,
    firstBidAt: new Date(Date.now() - 86400000),
  });
  await createAuditEvent({ tenderId: tender3._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: EV Bus Fleet' });
  await createAuditEvent({ tenderId: tender3._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published', payload: { configHash: snapshot3.configHash } });
  await createAuditEvent({ tenderId: tender3._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_OPENED', description: 'Bidding window opened' });

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
      vendorSnapshot: { experienceYears: 10, annualTurnoverMinor: 60000000000, isBlacklisted: false, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {},
      derivedQualityScore: b.quality,
    });
    await createAuditEvent({ tenderId: tender3._id, actorId: b.vendor._id, actorRole: 'VENDOR', action: 'BID_SUBMITTED', description: `Bid submitted by ${b.vendor.name}`, vendorId: b.vendor._id, payload: { bidId: bid._id.toString() } });
  }

  // ==========================================
  // Tender 4: EVALUATED (4 Bids Evaluated)
  // ==========================================
  const snapshot4 = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: { maxBudgetMinor: 100000000000, minQualityScore: 65, maxDeliveryDays: 180, minExperienceYears: 5 },
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: standardCriteria,
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
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: standardCriteria,
    firstBidAt: new Date(Date.now() - 86400000 * 8),
  });

  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: Solar EPC' });
  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published', payload: { configHash: snapshot4.configHash } });
  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_OPENED', description: 'Bidding window opened' });

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
      vendorSnapshot: { experienceYears: b.exp, annualTurnoverMinor: b.turnover, isBlacklisted: false, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {},
      derivedQualityScore: b.quality,
    });
    await createAuditEvent({ tenderId: tender4._id, actorId: b.vendor._id, actorRole: 'VENDOR', action: 'BID_SUBMITTED', description: `Bid submitted by ${b.vendor.name}`, vendorId: b.vendor._id, payload: { bidId: bid._id.toString() } });
  }

  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_CLOSED', description: 'Bidding closed' });
  await createAuditEvent({ tenderId: tender4._id, actorId: admin._id, actorRole: 'ADMIN', action: 'FINANCIAL_BIDS_OPENED', description: 'Financial bids unsealed' });
  await runTenderEvaluation({ tenderId: tender4._id, configSnapshot: snapshot4, adminId: admin._id });

  // ==========================================
  // Tender 5: CLOSED (Full Cycle Demo)
  // ==========================================
  const snapshot5 = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: { maxBudgetMinor: 30000000000, minQualityScore: 70, maxDeliveryDays: 90, minExperienceYears: 5 },
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: standardCriteria,
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
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: standardCriteria,
    firstBidAt: new Date(Date.now() - 86400000 * 25),
  });

  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: CCTV Surveillance' });
  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published', payload: { configHash: snapshot5.configHash } });
  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_OPENED', description: 'Bidding opened' });

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
      vendorSnapshot: { experienceYears: b.exp, annualTurnoverMinor: b.turnover, isBlacklisted: false, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {},
      derivedQualityScore: b.quality,
    });
    await createAuditEvent({ tenderId: tender5._id, actorId: b.vendor._id, actorRole: 'VENDOR', action: 'BID_SUBMITTED', description: `Bid submitted by ${b.vendor.name}`, vendorId: b.vendor._id, payload: { bidId: bid._id.toString() } });
  }

  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_CLOSED', description: 'Bidding closed' });
  await createAuditEvent({ tenderId: tender5._id, actorId: admin._id, actorRole: 'ADMIN', action: 'FINANCIAL_BIDS_OPENED', description: 'Financial bids unsealed' });
  await runTenderEvaluation({ tenderId: tender5._id, configSnapshot: snapshot5, adminId: admin._id });
  await confirmWinner(tender5._id, admin._id);
  await closeTender(tender5._id, admin._id, 'Procurement completed. Contract awarded to Tata Advanced Systems.');

  console.log('3. Creating Proof Tenders: Weight-Flip Pair (SPEC §21)...');

  // ==========================================
  // Proof Tender 6A: Weight-Flip Tender A (Price-Heavy: 40/30/20/10)
  // ==========================================
  const flipCriteriaA = [
    { key: 'price', label: 'Price', direction: 'lower' as const, weight: 40, unit: 'INR', valueSource: { type: 'BID_FIELD' as const, path: 'priceMinor' as const } },
    { key: 'quality', label: 'Quality Score', direction: 'higher' as const, weight: 30, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' as const } },
    { key: 'delivery', label: 'Delivery Time', direction: 'lower' as const, weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD' as const, path: 'deliveryDays' as const } },
    { key: 'experience', label: 'Vendor Experience', direction: 'higher' as const, weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD' as const, path: 'experienceYears' as const } },
  ];

  const snapshot6A = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: { maxBudgetMinor: 100000000000, minQualityScore: 60, maxDeliveryDays: 60, minExperienceYears: 3 },
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: flipCriteriaA,
    tieBreakOrder: ['derivedQualityScore', 'priceMinor', 'deliveryDays', 'vendorExperience', 'bidId'],
  });

  const tender6A = await Tender.create({
    tenderCode: 'TND-2026-FLIP-A',
    title: 'Enterprise Server Infrastructure (Config A - Price Heavy 40/30/20/10)',
    description: 'Procurement of datacenter blade servers evaluated with 40% Price weighting',
    department: 'Department of Telecommunications',
    category: 'IT Hardware',
    createdBy: admin._id,
    status: 'BIDDING_CLOSED',
    configLockState: 'HARD_LOCKED',
    lockedConfig: { ...snapshot6A, lockState: 'HARD_LOCKED', hardLockedAt: new Date(Date.now() - 86400000 * 2) },
    configHistory: [snapshot6A],
    startAt: new Date(Date.now() - 86400000 * 10),
    deadlineAt: new Date(Date.now() - 86400000),
    constraints: snapshot6A.constraints,
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: flipCriteriaA,
    firstBidAt: new Date(Date.now() - 86400000 * 5),
  });

  await createAuditEvent({ tenderId: tender6A._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: Server Infra (Config A)' });
  await createAuditEvent({ tenderId: tender6A._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published', payload: { configHash: snapshot6A.configHash } });
  await createAuditEvent({ tenderId: tender6A._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_OPENED', description: 'Bidding opened' });

  // Identical Bids for both Flip Tenders:
  // Vendor 1 (Tata): Price 50 Cr (cheaper), Quality 75
  // Vendor 2 (Infosys): Price 95 Cr (higher), Quality 95 (superior)
  const flipBidsData = [
    { vendor: vendorUsers[0], price: 50000000000, days: 25, quality: 75, exp: 5, turnover: 85000000000 },
    { vendor: vendorUsers[1], price: 95000000000, days: 20, quality: 95, exp: 10, turnover: 120000000000 },
  ];

  for (const b of flipBidsData) {
    const bid = await Bid.create({
      tender: tender6A._id,
      vendor: b.vendor._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: snapshot6A.configHash,
      priceMinor: b.price,
      deliveryDays: { value: b.days, provenance: { ...DEFAULT_PROVENANCE } },
      vendorSnapshot: { experienceYears: b.exp, annualTurnoverMinor: b.turnover, isBlacklisted: false, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {},
      derivedQualityScore: b.quality,
    });
    await createAuditEvent({ tenderId: tender6A._id, actorId: b.vendor._id, actorRole: 'VENDOR', action: 'BID_SUBMITTED', description: `Bid submitted by ${b.vendor.name}`, vendorId: b.vendor._id, payload: { bidId: bid._id.toString() } });
  }

  await createAuditEvent({ tenderId: tender6A._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_CLOSED', description: 'Bidding closed' });
  await createAuditEvent({ tenderId: tender6A._id, actorId: admin._id, actorRole: 'ADMIN', action: 'FINANCIAL_BIDS_OPENED', description: 'Financial bids unsealed' });

  const eval6A = await runTenderEvaluation({ tenderId: tender6A._id, configSnapshot: snapshot6A, adminId: admin._id });
  const winner6A = eval6A.results.find((r) => r.rank === 1);
  console.log(`✓ Tender FLIP-A (40/30/20/10) Winner: ${winner6A?.vendorName} (Score: ${winner6A?.finalScore?.toFixed(2)})`);

  // ==========================================
  // Proof Tender 6B: Weight-Flip Tender B (Quality-Heavy: 20/50/20/10)
  // ==========================================
  const flipCriteriaB = [
    { key: 'price', label: 'Price', direction: 'lower' as const, weight: 20, unit: 'INR', valueSource: { type: 'BID_FIELD' as const, path: 'priceMinor' as const } },
    { key: 'quality', label: 'Quality Score', direction: 'higher' as const, weight: 50, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' as const } },
    { key: 'delivery', label: 'Delivery Time', direction: 'lower' as const, weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD' as const, path: 'deliveryDays' as const } },
    { key: 'experience', label: 'Vendor Experience', direction: 'higher' as const, weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD' as const, path: 'experienceYears' as const } },
  ];

  const snapshot6B = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: { maxBudgetMinor: 100000000000, minQualityScore: 60, maxDeliveryDays: 60, minExperienceYears: 3 },
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: flipCriteriaB,
    tieBreakOrder: ['derivedQualityScore', 'priceMinor', 'deliveryDays', 'vendorExperience', 'bidId'],
  });

  const tender6B = await Tender.create({
    tenderCode: 'TND-2026-FLIP-B',
    title: 'Enterprise Server Infrastructure (Config B - Quality Heavy 20/50/20/10)',
    description: 'Identical bids evaluated with 50% Quality weighting, demonstrating transparent weight-driven ranking flip',
    department: 'Department of Telecommunications',
    category: 'IT Hardware',
    createdBy: admin._id,
    status: 'BIDDING_CLOSED',
    configLockState: 'HARD_LOCKED',
    lockedConfig: { ...snapshot6B, lockState: 'HARD_LOCKED', hardLockedAt: new Date(Date.now() - 86400000 * 2) },
    configHistory: [snapshot6B],
    startAt: new Date(Date.now() - 86400000 * 10),
    deadlineAt: new Date(Date.now() - 86400000),
    constraints: snapshot6B.constraints,
    eligibilityRules: baseEligibilityRules,
    scoringCriteria: flipCriteriaB,
    firstBidAt: new Date(Date.now() - 86400000 * 5),
  });

  await createAuditEvent({ tenderId: tender6B._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: Server Infra (Config B)' });
  await createAuditEvent({ tenderId: tender6B._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published', payload: { configHash: snapshot6B.configHash } });
  await createAuditEvent({ tenderId: tender6B._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_OPENED', description: 'Bidding opened' });

  for (const b of flipBidsData) {
    const bid = await Bid.create({
      tender: tender6B._id,
      vendor: b.vendor._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: snapshot6B.configHash,
      priceMinor: b.price,
      deliveryDays: { value: b.days, provenance: { ...DEFAULT_PROVENANCE } },
      vendorSnapshot: { experienceYears: b.exp, annualTurnoverMinor: b.turnover, isBlacklisted: false, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {},
      derivedQualityScore: b.quality,
    });
    await createAuditEvent({ tenderId: tender6B._id, actorId: b.vendor._id, actorRole: 'VENDOR', action: 'BID_SUBMITTED', description: `Bid submitted by ${b.vendor.name}`, vendorId: b.vendor._id, payload: { bidId: bid._id.toString() } });
  }

  await createAuditEvent({ tenderId: tender6B._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_CLOSED', description: 'Bidding closed' });
  await createAuditEvent({ tenderId: tender6B._id, actorId: admin._id, actorRole: 'ADMIN', action: 'FINANCIAL_BIDS_OPENED', description: 'Financial bids unsealed' });

  const eval6B = await runTenderEvaluation({ tenderId: tender6B._id, configSnapshot: snapshot6B, adminId: admin._id });
  const winner6B = eval6B.results.find((r) => r.rank === 1);
  console.log(`✓ Tender FLIP-B (20/50/20/10) Winner: ${winner6B?.vendorName} (Score: ${winner6B?.finalScore?.toFixed(2)})`);

  if (winner6A?.vendorName === winner6B?.vendorName) {
    throw new Error(`Weight-flip failed: Both tenders selected the same winner ${winner6A?.vendorName}`);
  }
  console.log(`✓ VERIFIED: Winner successfully flipped between ${winner6A?.vendorName} and ${winner6B?.vendorName}!`);

  console.log('4. Creating Proof Tender 7: 6-Criteria Multi-Source Tender (SPEC §21 / TND-2026-003)...');

  // ==========================================
  // Proof Tender 7: 6-Criteria Generic Engine Proof (TND-2026-003)
  // ==========================================
  const sixCriteriaTechnical = [
    {
      key: 'warrantyYears',
      label: 'Extended Hardware Warranty Period',
      points: 50,
      type: 'numeric' as const,
      direction: 'higher' as const,
      min: 1,
      max: 10,
    },
    {
      key: 'slaResponseHours',
      label: 'Critical Incident SLA Response Time',
      points: 50,
      type: 'numeric' as const,
      direction: 'lower' as const,
      min: 1,
      max: 24,
    },
  ];

  const sixCriteriaScoring = [
    { key: 'price', label: 'Commercial Bid Price', direction: 'lower' as const, weight: 30, unit: 'INR', valueSource: { type: 'BID_FIELD' as const, path: 'priceMinor' as const } },
    { key: 'quality', label: 'Quality Score', direction: 'higher' as const, weight: 20, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' as const } },
    { key: 'delivery', label: 'Delivery Schedule', direction: 'lower' as const, weight: 15, unit: 'days', valueSource: { type: 'BID_FIELD' as const, path: 'deliveryDays' as const } },
    { key: 'warranty', label: 'Warranty Period', direction: 'higher' as const, weight: 15, unit: 'years', valueSource: { type: 'TECHNICAL_VALUE' as const, path: 'warrantyYears' } },
    { key: 'slaResponse', label: 'SLA Response Time', direction: 'lower' as const, weight: 10, unit: 'hours', valueSource: { type: 'TECHNICAL_VALUE' as const, path: 'slaResponseHours' } },
    { key: 'experience', label: 'Vendor Track Record', direction: 'higher' as const, weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD' as const, path: 'experienceYears' as const } },
  ]; // Sum of weights: 30 + 20 + 15 + 15 + 10 + 10 = 100

  const snapshot7 = buildTenderConfigSnapshot({
    version: 1,
    lockedBy: admin._id,
    constraints: { maxBudgetMinor: 80000000000, minQualityScore: 60, maxDeliveryDays: 90, minExperienceYears: 3 },
    eligibilityRules: baseEligibilityRules,
    technicalCriteria: sixCriteriaTechnical,
    scoringCriteria: sixCriteriaScoring,
    tieBreakOrder: ['derivedQualityScore', 'priceMinor', 'deliveryDays', 'vendorExperience', 'bidId'],
  });

  const tender7 = await Tender.create({
    tenderCode: 'TND-2026-003',
    title: 'High-Security Datacenter Infrastructure & 24/7 Managed O&M',
    description: 'Generic 6-criteria procurement demonstrating TECHNICAL_VALUE sourcing for warranty and SLA response time',
    department: 'Defence Research and Development Organisation (DRDO)',
    category: 'Defence IT Infrastructure',
    createdBy: admin._id,
    status: 'BIDDING_CLOSED',
    configLockState: 'HARD_LOCKED',
    lockedConfig: { ...snapshot7, lockState: 'HARD_LOCKED', hardLockedAt: new Date(Date.now() - 86400000 * 3) },
    configHistory: [snapshot7],
    startAt: new Date(Date.now() - 86400000 * 15),
    deadlineAt: new Date(Date.now() - 86400000 * 2),
    constraints: snapshot7.constraints,
    eligibilityRules: baseEligibilityRules,
    technicalCriteria: sixCriteriaTechnical,
    scoringCriteria: sixCriteriaScoring,
    firstBidAt: new Date(Date.now() - 86400000 * 10),
  });

  await createAuditEvent({ tenderId: tender7._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_CREATED', description: 'Tender created: 6-Criteria DRDO Datacenter' });
  await createAuditEvent({ tenderId: tender7._id, actorId: admin._id, actorRole: 'ADMIN', action: 'TENDER_PUBLISHED', description: 'Tender published with 6 criteria', payload: { configHash: snapshot7.configHash } });
  await createAuditEvent({ tenderId: tender7._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_OPENED', description: 'Bidding opened' });

  const sixCriteriaBids = [
    {
      vendor: vendorUsers[0],
      price: 65000000000,
      days: 45,
      quality: 90,
      warranty: 5,
      sla: 2,
      exp: 12,
      turnover: 85000000000,
    },
    {
      vendor: vendorUsers[2],
      price: 72000000000,
      days: 60,
      quality: 85,
      warranty: 7,
      sla: 4,
      exp: 10,
      turnover: 65000000000,
    },
    {
      vendor: vendorUsers[3],
      price: 68000000000,
      days: 50,
      quality: 88,
      warranty: 6,
      sla: 1,
      exp: 8,
      turnover: 45000000000,
    },
  ];

  for (const b of sixCriteriaBids) {
    const bid = await Bid.create({
      tender: tender7._id,
      vendor: b.vendor._id,
      revision: 1,
      isLatest: true,
      configVersionAtSubmission: 1,
      configHashAtSubmission: snapshot7.configHash,
      priceMinor: b.price,
      deliveryDays: { value: b.days, provenance: { ...DEFAULT_PROVENANCE } },
      vendorSnapshot: { experienceYears: b.exp, annualTurnoverMinor: b.turnover, isBlacklisted: false, provenance: { ...DEFAULT_PROVENANCE } },
      technicalValues: {
        warrantyYears: { value: b.warranty, provenance: { ...DEFAULT_PROVENANCE } },
        slaResponseHours: { value: b.sla, provenance: { ...DEFAULT_PROVENANCE } },
      },
      derivedQualityScore: b.quality,
    });
    await createAuditEvent({ tenderId: tender7._id, actorId: b.vendor._id, actorRole: 'VENDOR', action: 'BID_SUBMITTED', description: `Bid submitted by ${b.vendor.name}`, vendorId: b.vendor._id, payload: { bidId: bid._id.toString() } });
  }

  await createAuditEvent({ tenderId: tender7._id, actorId: admin._id, actorRole: 'ADMIN', action: 'BIDDING_CLOSED', description: 'Bidding closed' });
  await createAuditEvent({ tenderId: tender7._id, actorId: admin._id, actorRole: 'ADMIN', action: 'FINANCIAL_BIDS_OPENED', description: 'Financial bids unsealed' });

  const eval7 = await runTenderEvaluation({ tenderId: tender7._id, configSnapshot: snapshot7, adminId: admin._id });
  console.log(`✓ Tender TND-2026-003 (6-Criteria) Evaluated with ${eval7.results.length} bids across 6 scoring dimensions!`);

  console.log('5. Verifying Cryptographic Audit Chains for all 7 Seeded Tenders...');
  const allTenders = [tender1, tender2, tender3, tender4, tender5, tender6A, tender6B, tender7];
  for (const t of allTenders) {
    const check = await verifyAuditChain(t._id);
    if (!check.valid) {
      throw new Error(`Audit chain verification failed for seeded tender ${t.tenderCode}: ${check.reason}`);
    }
    console.log(`✓ Audit chain for ${t.tenderCode} is valid (${check.totalEntries} entries)`);
  }

  console.log('Database seeding successfully completed with all 7 tenders and proofs!');
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
