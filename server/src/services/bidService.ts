/**
 * Bid Service with Provenance, Revisioning, and Two-Envelope Sealing (SPEC §5, §6.4, §8.5, §14.3)
 */

import { Types } from 'mongoose';
import { Bid, IBid } from '../models/bid.js';
import { Tender } from '../models/tender.js';
import { VendorProfile } from '../models/vendorProfile.js';
import { UserRole } from '../models/user.js';
import { AppError } from './tenderService.js';
import { computeDerivedQualityScore } from '../engines/qualityEngine.js';
import { createAuditEvent } from './auditService.js';
import { Provenance, ProvenanceSource } from '@agps/shared';
import { SubmitBidInput } from '../validators/bid.validator.js';

export async function submitBid(
  tenderId: string | Types.ObjectId,
  vendorUserId: string | Types.ObjectId,
  input: SubmitBidInput
): Promise<IBid> {
  const tender = await Tender.findById(tenderId);
  if (!tender) {
    throw new AppError(404, 'NOT_FOUND', 'Tender not found');
  }

  // 1. Lifecycle & Deadline validation (Server Clock only, SPEC §14.1, §17.4)
  const now = new Date();
  if (new Date(tender.deadlineAt) <= now || tender.status === 'BIDDING_CLOSED' || tender.status === 'CLOSED' || tender.status === 'CANCELLED' || tender.status === 'FAILED') {
    throw new AppError(400, 'BIDDING_CLOSED', 'Bidding deadline has passed or bidding is closed');
  }

  if (tender.status === 'DRAFT') {
    throw new AppError(400, 'TENDER_NOT_PUBLISHED', 'Cannot bid on draft tender');
  }

  if (!tender.lockedConfig) {
    throw new AppError(500, 'CONFIG_NOT_LOCKED', 'Tender missing frozen configuration snapshot');
  }

  // 2. Fetch vendor profile
  const vendorProfile = await VendorProfile.findOne({ user: new Types.ObjectId(vendorUserId) });
  if (!vendorProfile) {
    throw new AppError(404, 'VENDOR_PROFILE_NOT_FOUND', 'Vendor profile must be completed before bidding');
  }

  // 3. Atomic First-Bid Lock (SPEC §6.4, Test 22)
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

  // 4. Packaging per-field provenance (SPEC §5.2, §5.6, Test 25)
  const hasEvidence = Array.isArray(input.evidence) && input.evidence.length > 0;
  const provenanceSource: ProvenanceSource = hasEvidence ? 'DOCUMENT_SUPPORTED' : 'SELF_REPORTED';

  const defaultFieldProvenance: Provenance = {
    source: provenanceSource,
    verificationStatus: 'UNVERIFIED', // Always UNVERIFIED in this build (Test 25, 26)
    evidence: (input.evidence || []).map((e) => ({
      name: e.name,
      type: e.type,
      sizeBytes: e.sizeBytes,
      uploadedAt: e.uploadedAt ? new Date(e.uploadedAt) : new Date(),
    })),
    verifiedBy: null,
    verifiedAt: null,
    verificationNote: null,
  };

  // Package technical values
  const packagedTechnicalValues: Record<string, { value: any; provenance: Provenance }> = {};
  const rawTechMap: Record<string, any> = {};

  for (const [key, val] of Object.entries(input.technicalValues || {})) {
    packagedTechnicalValues[key] = {
      value: val,
      provenance: { ...defaultFieldProvenance },
    };
    rawTechMap[key] = val;
  }

  // 5. Compute derived quality score deterministically from declared claims (SPEC §9)
  const derivedQualityScore = computeDerivedQualityScore(
    rawTechMap,
    tender.lockedConfig.technicalCriteria || []
  );

  // 6. Handle revisions and isLatest management (SPEC §8.5, Test 29)
  const previousLatest = await Bid.findOne({
    tender: tender._id,
    vendor: new Types.ObjectId(vendorUserId),
    isLatest: true,
  });

  const revision = previousLatest ? previousLatest.revision + 1 : 1;

  if (previousLatest) {
    previousLatest.isLatest = false;
    await previousLatest.save();
  }

  // 7. Create new Bid with config version stamp
  const bid = new Bid({
    tender: tender._id,
    vendor: new Types.ObjectId(vendorUserId),
    revision,
    isLatest: true,
    submittedAt: now,
    configVersionAtSubmission: tender.lockedConfig.version,
    configHashAtSubmission: tender.lockedConfig.configHash,

    // Technical envelope
    technicalValues: packagedTechnicalValues,
    deliveryDays: {
      value: input.deliveryDays,
      provenance: { ...defaultFieldProvenance },
    },
    vendorSnapshot: {
      experienceYears: vendorProfile.experienceYears,
      annualTurnoverMinor: vendorProfile.annualTurnoverMinor,
      isBlacklisted: vendorProfile.isBlacklisted,
      provenance: vendorProfile.provenance,
    },

    // Financial envelope
    priceMinor: input.priceMinor,

    // Derived
    derivedQualityScore,
    dataIntegrity: {
      verifiedFieldCount: 0,
      totalFieldCount: Object.keys(packagedTechnicalValues).length + 2,
      overallStatus: 'UNVERIFIED',
    },
  });

  await bid.save();

  // Audit event (SPEC §16)
  await createAuditEvent({
    tenderId: tender._id,
    actorId: vendorUserId,
    actorRole: 'VENDOR',
    action: revision > 1 ? 'BID_REVISED' : 'BID_SUBMITTED',
    description: `Bid ${revision > 1 ? `revised to revision ${revision}` : 'submitted'} by vendor`,
    vendorId: vendorUserId,
    payload: {
      bidId: bid._id.toString(),
      revision,
      configVersion: tender.lockedConfig.version,
      configHash: tender.lockedConfig.configHash,
    },
  });

  return bid;
}

export async function getBidsForTender(
  tenderId: string | Types.ObjectId,
  user: { id: string; role: UserRole }
): Promise<any[]> {
  const tender = await Tender.findById(tenderId);
  if (!tender) {
    throw new AppError(404, 'NOT_FOUND', 'Tender not found');
  }

  // VENDOR can never see other vendors' bids (SPEC §4, §17.2)
  if (user.role === 'VENDOR') {
    return Bid.find({ tender: tender._id, vendor: new Types.ObjectId(user.id) })
      .select('+priceMinor')
      .sort({ submittedAt: -1 })
      .exec();
  }

  // ADMIN / AUDITOR querying bids
  // Two-Envelope Price Sealing (SPEC §14.3, §17.4, Test 34)
  // Price is select: false by default at schema level; opt in explicitly only if unsealed
  const unsealedStatuses = [
    'FINANCIAL_OPEN',
    'UNDER_EVALUATION',
    'EVALUATED',
    'WINNER_SELECTED',
    'CLOSED',
  ];
  const isFinancialUnsealed = unsealedStatuses.includes(tender.status);

  const query = Bid.find({ tender: tender._id, isLatest: true }).populate('vendor', 'name email');

  if (isFinancialUnsealed) {
    query.select('+priceMinor');
  }

  const bids = await query.exec();

  if (!isFinancialUnsealed) {
    return bids.map((b) => ({
      ...b.toObject(),
      isPriceSealed: true,
    }));
  }

  return bids;
}
