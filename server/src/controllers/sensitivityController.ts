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
import { Tender } from '../models/tender.js';
import { verifyTenderDepartmentAccess } from './tenderController.js';

export async function simulateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenderId = req.params.id as string;
    const tender = await Tender.findById(tenderId);
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(tender, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot simulate tenders outside your authorized department',
        });
        return;
      }
    }

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
    const tender = await Tender.findById(tenderId);
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(tender, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot view breakeven for tenders outside your authorized department',
        });
        return;
      }
    }

    const result = await calculateTenderBreakeven(tenderId);
    res.status(200).json({ breakeven: result });
  } catch (err) {
    next(err);
  }
}

export async function reportCsvHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenderId = req.params.id as string;
    const tender = await Tender.findById(tenderId);
    if (!tender) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Tender not found' });
      return;
    }

    if (req.user?.role === 'PROCUREMENT_OFFICER') {
      const hasAccess = await verifyTenderDepartmentAccess(tender, req.user);
      if (!hasAccess) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Forbidden: you cannot export reports for tenders outside your authorized department',
        });
        return;
      }
    }

    const csvContent = await generateTenderReportCsv(tenderId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tender-${tenderId}-report.csv"`);
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
}

export async function dashboardSummaryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await getDashboardSummary(req.user);
    res.status(200).json({ summary });
  } catch (err) {
    next(err);
  }
}
