import { Router } from 'express';
import {
  createTenderHandler,
  getTendersHandler,
  getTenderByIdHandler,
  updateTenderHandler,
  transitionTenderHandler,
} from '../controllers/tenderController.js';
import { submitBidHandler, getTenderBidsHandler } from '../controllers/bidController.js';
import { evaluateTenderHandler, getTenderEvaluationHandler } from '../controllers/evaluationController.js';
import {
  confirmWinnerHandler,
  overrideWinnerHandler,
  closeTenderHandler,
  getExplainabilityHandler,
  compareBidsHandler,
} from '../controllers/awardController.js';
import {
  simulateHandler,
  breakevenHandler,
  reportCsvHandler,
} from '../controllers/sensitivityController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const tenderRouter = Router();

tenderRouter.get('/', authenticateToken, getTendersHandler);
tenderRouter.post('/', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER'), createTenderHandler);
tenderRouter.get('/:id', authenticateToken, getTenderByIdHandler);
tenderRouter.patch('/:id', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER'), updateTenderHandler);
tenderRouter.post('/:id/transition', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER'), transitionTenderHandler);

// Bid submission & listing (SPEC §23)
tenderRouter.post('/:id/bids', authenticateToken, requireRole('VENDOR'), submitBidHandler);
tenderRouter.get('/:id/bids', authenticateToken, getTenderBidsHandler);

// Evaluation (SPEC §23)
tenderRouter.post('/:id/evaluate', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER'), evaluateTenderHandler);
tenderRouter.get('/:id/evaluation', authenticateToken, getTenderEvaluationHandler);

// Award, Override & Closure (SPEC §15, §23)
tenderRouter.post('/:id/award/confirm', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER'), confirmWinnerHandler);
tenderRouter.post('/:id/award/override', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER'), overrideWinnerHandler);
tenderRouter.post('/:id/close', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER'), closeTenderHandler);

// Explainability & Bid Comparison (SPEC §15.4, §15.5, §23)
tenderRouter.get('/:id/explainability', authenticateToken, getExplainabilityHandler);
tenderRouter.get('/:id/compare', authenticateToken, compareBidsHandler);

// Sensitivity Simulation, Breakeven & CSV Export (SPEC §13, §14.5, §18, §23)
tenderRouter.post('/:id/simulate', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER', 'AUDITOR'), simulateHandler);
tenderRouter.get('/:id/breakeven', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER', 'AUDITOR'), breakevenHandler);
tenderRouter.get('/:id/report.csv', authenticateToken, requireRole('ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER', 'AUDITOR'), reportCsvHandler);
