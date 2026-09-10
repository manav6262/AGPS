/**
 * Award & Explainability Controller (SPEC §15, §23 & change01.md §10, §11)
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
import { Tender } from '../models/tender.js';
import { verifyTenderDepartmentAccess } from './tenderController.js';

export async function confirmWinnerHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(tender, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot confirm winners for tenders outside your authorized department',
        });
        return;
      }
    }

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
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(tender, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot override winners for tenders outside your authorized department',
        });
        return;
      }
    }

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
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(tender, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot close tenders outside your authorized department',
        });
        return;
      }
    }

    const data = closeTenderSchema.parse(req.body);
    const updated = await closeTender(req.params.id as string, req.user!.id, data.closureNotes);
    res.status(200).json({ tender: updated });
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
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(tender, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot access reports for tenders outside your authorized department',
        });
        return;
      }
    }

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
    const tender = await Tender.findById(req.params.id);
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(tender, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot compare bids for tenders outside your authorized department',
        });
        return;
      }
    }

    const bidIdsQuery = req.query.bidIds as string;
    const bidIds = bidIdsQuery ? bidIdsQuery.split(',').map((s) => s.trim()) : [];
    const comparison = await compareBids(req.params.id as string, bidIds, req.user!);
    res.status(200).json({ comparison });
  } catch (err) {
    next(err);
  }
}
