/**
 * Tender Controller (SPEC §23)
 */

import { Request, Response, NextFunction } from 'express';
import {
  createTender,
  updateTender,
  transitionTender,
} from '../services/tenderService.js';
import {
  createTenderSchema,
  updateTenderSchema,
  transitionTenderSchema,
} from '../validators/tender.validator.js';
import { Tender } from '../models/tender.js';

export async function createTenderHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = createTenderSchema.parse(req.body);
    const tender = await createTender(data, req.user!.id);
    res.status(201).json({ tender });
  } catch (err) {
    next(err);
  }
}

export async function getTendersHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const role = req.user?.role;
    let filter: Record<string, any> = {};

    // Scoped visibility: VENDOR only sees published/open/closed tenders, not DRAFT
    if (role === 'VENDOR') {
      filter = { status: { $ne: 'DRAFT' } };
    }

    const tenders = await Tender.find(filter).sort({ createdAt: -1 }).exec();
    res.status(200).json({ tenders });
  } catch (err) {
    next(err);
  }
}

export async function getTenderByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tender = await Tender.findById(req.params.id).exec();
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    // Role-based visibility check: VENDOR cannot view DRAFT tenders
    if (req.user?.role === 'VENDOR' && tender.status === 'DRAFT') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    res.status(200).json({ tender });
  } catch (err) {
    next(err);
  }
}

export async function updateTenderHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = updateTenderSchema.parse(req.body);
    const updated = await updateTender(req.params.id as string, data, req.user!.id);
    res.status(200).json({ tender: updated });
  } catch (err) {
    next(err);
  }
}

export async function transitionTenderHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = transitionTenderSchema.parse(req.body);
    const updated = await transitionTender(req.params.id as string, data.targetStatus, req.user!.id);
    res.status(200).json({ tender: updated });
  } catch (err) {
    next(err);
  }
}
