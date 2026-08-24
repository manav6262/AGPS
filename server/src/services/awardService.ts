/**
 * Award, Human Override, Closure, and Explainability Service (SPEC §15)
 */

import { Types } from 'mongoose';
import { Tender, ITender } from '../models/tender.js';
import { Evaluation, IEvaluation } from '../models/evaluation.js';
import { AppError } from './tenderService.js';
import { createAuditEvent } from './auditService.js';
import { UserRole } from '../models/user.js';

export interface ExplainabilityReport {
  tenderId: string;
  tenderCode: string;
  title: string;
  status: string;
  evaluatedAt: Date;
  configHash: string;
  summary: any;
  provenanceSummary: any;
  scoringCriteria: any[];
  results: any[];
}

export async function confirmWinner(
  tenderId: string | Types.ObjectId,
  adminId: string | Types.ObjectId
): Promise<{ tender: ITender; evaluation: IEvaluation }> {
  const tender = await Tender.findById(tenderId);
  if (!tender) {
    throw new AppError(404, 'NOT_FOUND', 'Tender not found');
  }

  if (tender.status !== 'EVALUATED') {
    throw new AppError(
      400,
      'INVALID_TENDER_STATUS',
      `Cannot confirm winner: tender is in status '${tender.status}', expected 'EVALUATED'`
    );
  }

  const evaluation = await Evaluation.findOne({ tender: tender._id }).sort({ runNumber: -1 });
  if (!evaluation || evaluation.summary.outcome !== 'RANKED' || !evaluation.summary.winnerBid) {
    throw new AppError(
      400,
      'NO_WINNER_AVAILABLE',
      'Cannot confirm winner: no recommended winner found in evaluation run'
    );
  }

  const winnerResult = evaluation.results.find((r) => r.bidId === evaluation.summary.winnerBid);

  // Transition Tender to WINNER_SELECTED
  tender.status = 'WINNER_SELECTED';
  await tender.save();

  // Audit event (SPEC §15.1)
  await createAuditEvent({
    tenderId: tender._id,
    actorId: adminId,
    actorRole: 'ADMIN',
    action: 'WINNER_CONFIRMED',
    description: `Winner confirmed: ${winnerResult?.vendorName || evaluation.summary.winnerBid}`,
    vendorId: winnerResult ? winnerResult.vendorId : null,
    payload: {
      evaluationId: evaluation._id.toString(),
      awardedBidId: evaluation.summary.winnerBid,
      vendorName: winnerResult?.vendorName,
      winningScore: evaluation.summary.winningScore,
    },
  });

  return { tender, evaluation };
}

export async function overrideWinner(
  tenderId: string | Types.ObjectId,
  targetBidId: string,
  justification: string,
  adminId: string | Types.ObjectId
): Promise<{ tender: ITender; evaluation: IEvaluation }> {
  const tender = await Tender.findById(tenderId);
  if (!tender) {
    throw new AppError(404, 'NOT_FOUND', 'Tender not found');
  }

  if (tender.status !== 'EVALUATED') {
    throw new AppError(
      400,
      'INVALID_TENDER_STATUS',
      `Cannot override winner: tender is in status '${tender.status}', expected 'EVALUATED'`
    );
  }

  const evaluation = await Evaluation.findOne({ tender: tender._id }).sort({ runNumber: -1 });
  if (!evaluation) {
    throw new AppError(400, 'NO_EVALUATION', 'No evaluation run found for tender');
  }

  // Mandatory non-empty justification validation (SPEC §15.2)
  if (!justification || justification.trim().length < 10) {
    throw new AppError(
      400,
      'JUSTIFICATION_REQUIRED',
      'A non-empty justification of at least 10 characters is mandatory for human winner override'
    );
  }

  const targetResult = evaluation.results.find((r) => r.bidId === targetBidId);
  if (!targetResult) {
    throw new AppError(404, 'BID_NOT_FOUND', 'Target bid not found in evaluation results');
  }

  // Invariant: Override CANNOT award an ineligible bid (SPEC §15.2)
  if (!targetResult.eligible) {
    throw new AppError(
      400,
      'CANNOT_OVERRIDE_TO_INELIGIBLE',
      'Cannot override award to a disqualified or ineligible bid'
    );
  }

  const recommendedWinnerBidId = evaluation.summary.winnerBid;
  const recommendedResult = evaluation.results.find((r) => r.bidId === recommendedWinnerBidId);

  // Transition Tender to WINNER_SELECTED
  tender.status = 'WINNER_SELECTED';
  await tender.save();

  // Audit event with full override payload (SPEC §15.2, §16)
  await createAuditEvent({
    tenderId: tender._id,
    actorId: adminId,
    actorRole: 'ADMIN',
    action: 'WINNER_OVERRIDDEN',
    description: `Human override: award granted to ${targetResult.vendorName || targetBidId} over recommended winner ${recommendedResult?.vendorName || recommendedWinnerBidId}. Justification: ${justification}`,
    vendorId: targetResult.vendorId,
    payload: {
      evaluationId: evaluation._id.toString(),
      recommendedWinnerBidId,
      recommendedWinnerName: recommendedResult?.vendorName,
      recommendedWinningScore: recommendedResult?.finalScore,
      overriddenWinnerBidId: targetBidId,
      overriddenWinnerName: targetResult.vendorName,
      overriddenFinalScore: targetResult.finalScore,
      originalRank: targetResult.rank,
      justification,
    },
  });

  return { tender, evaluation };
}

export async function closeTender(
  tenderId: string | Types.ObjectId,
  adminId: string | Types.ObjectId,
  closureNotes?: string
): Promise<ITender> {
  const tender = await Tender.findById(tenderId);
  if (!tender) {
    throw new AppError(404, 'NOT_FOUND', 'Tender not found');
  }

  if (tender.status !== 'WINNER_SELECTED') {
    throw new AppError(
      400,
      'INVALID_TENDER_STATUS',
      `Cannot close tender from '${tender.status}', expected 'WINNER_SELECTED'`
    );
  }

  tender.status = 'CLOSED';
  await tender.save();

  await createAuditEvent({
    tenderId: tender._id,
    actorId: adminId,
    actorRole: 'ADMIN',
    action: 'TENDER_CLOSED',
    description: `Tender closed successfully${closureNotes ? `: ${closureNotes}` : ''}`,
    payload: { closureNotes: closureNotes || null },
  });

  return tender;
}

export async function getExplainabilityReport(
  tenderId: string | Types.ObjectId,
  user: { id: string; role: UserRole }
): Promise<ExplainabilityReport> {
  const tender = await Tender.findById(tenderId);
  if (!tender) {
    throw new AppError(404, 'NOT_FOUND', 'Tender not found');
  }

  const evaluation = await Evaluation.findOne({ tender: tender._id }).sort({ runNumber: -1 });
  if (!evaluation) {
    throw new AppError(404, 'NO_EVALUATION', 'No evaluation found for this tender');
  }

  let visibleResults = evaluation.results;

  // Debriefing Scoping for VENDOR (SPEC §15.4)
  if (user.role === 'VENDOR') {
    visibleResults = evaluation.results.filter((r) => r.vendorId === user.id);
  }

  return {
    tenderId: tender._id.toString(),
    tenderCode: tender.tenderCode,
    title: tender.title,
    status: tender.status,
    evaluatedAt: evaluation.evaluatedAt,
    configHash: evaluation.configHash,
    summary: evaluation.summary,
    provenanceSummary: evaluation.provenanceSummary,
    scoringCriteria: evaluation.configSnapshot?.scoringCriteria || [],
    results: visibleResults,
  };
}

export async function compareBids(
  tenderId: string | Types.ObjectId,
  bidIds: string[],
  user: { id: string; role: UserRole }
): Promise<any> {
  const report = await getExplainabilityReport(tenderId, user);
  const selectedResults = report.results.filter((r) => bidIds.includes(r.bidId));

  // Build side-by-side comparative criteria matrix
  const criteriaMatrix = report.scoringCriteria.map((criterion) => {
    const row: Record<string, any> = {
      criterionKey: criterion.key,
      label: criterion.label,
      weight: criterion.weight,
      unit: criterion.unit,
      direction: criterion.direction,
      bids: {} as Record<string, any>,
    };

    for (const r of selectedResults) {
      const breakdownItem = r.breakdown?.find((b: any) => b.key === criterion.key);
      row.bids[r.bidId] = {
        vendorName: r.vendorName,
        rawValue: breakdownItem?.rawValue,
        normalizedScore: breakdownItem?.normalizedScore,
        weightedScore: breakdownItem?.weightedScore,
        provenance: breakdownItem?.provenance,
      };
    }

    return row;
  });

  return {
    tenderCode: report.tenderCode,
    configHash: report.configHash,
    comparedBids: selectedResults.map((r) => ({
      bidId: r.bidId,
      vendorName: r.vendorName,
      eligible: r.eligible,
      finalScore: r.finalScore,
      rank: r.rank,
    })),
    criteriaMatrix,
  };
}
