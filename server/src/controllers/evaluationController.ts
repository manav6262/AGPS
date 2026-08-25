/**
 * Evaluation Controller (SPEC §23)
 */

import { Request, Response, NextFunction } from 'express';
import { runTenderEvaluation } from '../services/evaluationService.js';
import { Tender } from '../models/tender.js';
import { Evaluation } from '../models/evaluation.js';
import { AppError } from '../services/tenderService.js';
import { Types } from 'mongoose';

export async function evaluateTenderHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id as string)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    const tender = await Tender.findById(id as string);
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (!tender.lockedConfig) {
      throw new AppError(400, 'NO_CONFIG_SNAPSHOT', 'Tender lacks frozen configuration snapshot');
    }

    // Evaluation Service receives TenderConfigSnapshot, NEVER a Tender (SPEC §11)
    const evaluation = await runTenderEvaluation({
      tenderId: tender._id,
      configSnapshot: tender.lockedConfig,
      adminId: req.user!.id,
    });

    res.status(200).json({ evaluation });
  } catch (err) {
    next(err);
  }
}

export async function getTenderEvaluationHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id as string)) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    const evaluation = await Evaluation.findOne({ tender: new Types.ObjectId(id as string) })
      .sort({ evaluatedAt: -1 })
      .exec();

    if (!evaluation) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Evaluation not found for this tender' });
      return;
    }

    res.status(200).json({ evaluation });
  } catch (err) {
    next(err);
  }
}
