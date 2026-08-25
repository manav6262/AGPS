/**
 * Award & Explainability Controller (SPEC §15, §23)
 */

import { Request, Response, NextFunction } from 'express';
import {
  confirmWinner,
  overrideWinner,
  closeTender,
  getExplainabilityReport,
  compareBids,
} from '../services/awardService.js';
import {
  confirmWinnerSchema,
  overrideWinnerSchema,
  closeTenderSchema,
} from '../validators/award.validator.js';

export async function confirmWinnerHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    confirmWinnerSchema.parse(req.body);
    const result = await confirmWinner(req.params.id as string, req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function overrideWinnerHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = overrideWinnerSchema.parse(req.body);
    const result = await overrideWinner(
      req.params.id as string,
      data.targetBidId,
      data.justification,
      req.user!.id
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function closeTenderHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = closeTenderSchema.parse(req.body);
    const tender = await closeTender(req.params.id as string, req.user!.id, data.closureNotes);
    res.status(200).json({ tender });
  } catch (err) {
    next(err);
  }
}

export async function getExplainabilityHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const report = await getExplainabilityReport(req.params.id as string, req.user!);
    res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
}

export async function compareBidsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const bidIdsQuery = req.query.bidIds as string;
    const bidIds = bidIdsQuery ? bidIdsQuery.split(',').map((s) => s.trim()) : [];
    const comparison = await compareBids(req.params.id as string, bidIds, req.user!);
    res.status(200).json({ comparison });
  } catch (err) {
    next(err);
  }
}
