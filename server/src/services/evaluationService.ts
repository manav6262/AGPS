/**
 * Evaluation Service (SPEC §11, §12, §14.4)
 *
 * Receives a frozen TenderConfigSnapshot, NEVER a live Tender model.
 * Calls evaluateTenderPure (the pure evaluation coordinator).
 */

import { Types } from 'mongoose';
import { Evaluation, IEvaluation } from '../models/evaluation.js';
import { Tender } from '../models/tender.js';
import { Bid } from '../models/bid.js';
import { AppError } from './tenderService.js';
import { createAuditEvent } from './auditService.js';
import { evaluateTenderPure } from '../engines/evaluationEngine.js';
import {
  TenderConfigSnapshot,
  BidContext,
  ProvenanceSummary,
} from '@agps/shared';

export interface RunEvaluationParams {
  tenderId: string | Types.ObjectId;
  configSnapshot: TenderConfigSnapshot;
  adminId: string | Types.ObjectId;
}

const runningEvaluations = new Set<string>();

export async function runTenderEvaluation(params: RunEvaluationParams): Promise<IEvaluation> {
  const { tenderId, configSnapshot, adminId } = params;
  const tenderIdStr = tenderId.toString();

  // In-process lock per tender (SPEC §12.3)
  if (runningEvaluations.has(tenderIdStr)) {
    throw new AppError(409, 'EVALUATION_IN_PROGRESS', 'An evaluation is already running for this tender');
  }

  runningEvaluations.add(tenderIdStr);
  try {
    const tenderObjectId = new Types.ObjectId(tenderId);
    const startTime = Date.now();

    // 1. Fetch latest bids for this tender with explicit +priceMinor opt-in (SPEC §17.4)
    const bids = await Bid.find({
      tender: tenderObjectId,
      isLatest: true,
    })
      .select('+priceMinor')
      .populate('vendor', 'name email')
      .exec();

  if (!bids || bids.length === 0) {
    throw new AppError(400, 'NO_BIDS', 'Cannot evaluate tender with zero submitted bids');
  }

  // 2. Transform DB Bid documents into pure BidContext structures
  let totalFieldCount = 0;
  let verifiedFieldCount = 0;

  const bidContexts: BidContext[] = bids.map((b) => {
    const rawTech: Record<string, any> = {};
    if (b.technicalValues) {
      for (const [k, v] of Object.entries(b.technicalValues)) {
        rawTech[k] = (v as any)?.value ?? v;
      }
    }

    const tCount = b.dataIntegrity?.totalFieldCount || 3;
    const vCount = b.dataIntegrity?.verifiedFieldCount || 0;
    totalFieldCount += tCount;
    verifiedFieldCount += vCount;

    return {
      bidId: b._id.toString(),
      vendorId: b.vendor ? (b.vendor as any)._id?.toString() || b.vendor.toString() : 'UNKNOWN',
      vendorName: (b.vendor as any)?.name || 'Unknown Vendor',
      submittedAt: b.submittedAt,
      priceMinor: b.priceMinor,
      deliveryDays: b.deliveryDays,
      vendorSnapshot: b.vendorSnapshot,
      technicalValues: b.technicalValues,
      derivedQualityScore: b.derivedQualityScore,
    };
  });

  // 3. Call the pure evaluation coordinator
  const pureOutput = evaluateTenderPure(bidContexts, configSnapshot);

  // 4. Calculate run number (idempotent / sequential per tender)
  const lastEval = await Evaluation.findOne({ tender: tenderObjectId }).sort({ runNumber: -1 }).exec();
  const runNumber = lastEval ? lastEval.runNumber + 1 : 1;

  const provenanceSummary: ProvenanceSummary = {
    allSelfReported: verifiedFieldCount === 0,
    verifiedFieldCount,
    totalFieldCount,
    overallStatus: verifiedFieldCount === 0 ? 'UNVERIFIED' : 'PARTIALLY_VERIFIED',
  };

  const durationMs = Date.now() - startTime;

  // 5. Atomic persist: Create single Evaluation document (SPEC §11.1)
  const evaluation = new Evaluation({
    tender: tenderObjectId,
    runNumber,
    evaluatedBy: new Types.ObjectId(adminId),
    evaluatedAt: new Date(),
    configSnapshot,
    configHash: configSnapshot.configHash,
    durationMs,
    provenanceSummary,
    summary: pureOutput.summary,
    results: pureOutput.results,
  });

  await evaluation.save();

  // 6. Update Tender status based on outcome
  const tenderTargetStatus = pureOutput.summary.outcome === 'RANKED' ? 'EVALUATED' : 'FAILED';
  await Tender.updateOne(
    { _id: tenderObjectId },
    { $set: { status: tenderTargetStatus } }
  );

  // 7. Write Audit Event
  await createAuditEvent({
    tenderId: tenderObjectId,
    actorId: adminId,
    actorRole: 'ADMIN',
    action: pureOutput.summary.outcome === 'RANKED' ? 'EVALUATION_COMPLETED' : 'TENDER_FAILED',
    description: `Tender evaluation run #${runNumber} completed with outcome: ${pureOutput.summary.outcome}${pureOutput.summary.winnerBid ? ` (Winner Bid: ${pureOutput.summary.winnerBid})` : ''}`,
    payload: {
      evaluationId: evaluation._id.toString(),
      runNumber,
      outcome: pureOutput.summary.outcome,
      configVersion: configSnapshot.version,
      configHash: configSnapshot.configHash,
      winnerBid: pureOutput.summary.winnerBid,
      winningScore: pureOutput.summary.winningScore,
      totalBids: pureOutput.summary.totalBids,
      eligibleCount: pureOutput.summary.eligibleCount,
    },
  });

    return evaluation;
  } finally {
    runningEvaluations.delete(tenderIdStr);
  }
}
