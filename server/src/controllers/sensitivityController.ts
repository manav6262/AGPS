/**
 * Sensitivity, Breakeven, CSV Export, and Dashboard Controllers
 */

import { Request, Response, NextFunction } from 'express';
import {
  simulateTenderEvaluation,
  calculateTenderBreakeven,
  generateTenderReportCsv,
  getDashboardSummary,
} from '../services/sensitivityService.js';

export async function simulateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenderId = req.params.id as string;
    const { criteria } = req.body;

    if (!Array.isArray(criteria) || criteria.length === 0) {
      res.status(400).json({ error: 'INVALID_CRITERIA', message: 'Criteria must be a non-empty array' });
      return;
    }

    const result = await simulateTenderEvaluation(tenderId, criteria);
    res.status(200).json({ simulation: result });
  } catch (err) {
    next(err);
  }
}

export async function breakevenHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenderId = req.params.id as string;
    const result = await calculateTenderBreakeven(tenderId);
    res.status(200).json({ breakeven: result });
  } catch (err) {
    next(err);
  }
}

export async function reportCsvHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenderId = req.params.id as string;
    const csvContent = await generateTenderReportCsv(tenderId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tender-${tenderId}-report.csv"`);
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
}

export async function dashboardSummaryHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await getDashboardSummary();
    res.status(200).json({ summary });
  } catch (err) {
    next(err);
  }
}
