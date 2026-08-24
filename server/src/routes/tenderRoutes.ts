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
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const tenderRouter = Router();

tenderRouter.get('/', authenticateToken, getTendersHandler);
tenderRouter.post('/', authenticateToken, requireRole('ADMIN'), createTenderHandler);
tenderRouter.get('/:id', authenticateToken, getTenderByIdHandler);
tenderRouter.patch('/:id', authenticateToken, requireRole('ADMIN'), updateTenderHandler);
tenderRouter.post('/:id/transition', authenticateToken, requireRole('ADMIN'), transitionTenderHandler);

// Bid submission & listing (SPEC §23)
tenderRouter.post('/:id/bids', authenticateToken, requireRole('VENDOR'), submitBidHandler);
tenderRouter.get('/:id/bids', authenticateToken, getTenderBidsHandler);

// Evaluation (SPEC §23)
tenderRouter.post('/:id/evaluate', authenticateToken, requireRole('ADMIN'), evaluateTenderHandler);
tenderRouter.get('/:id/evaluation', authenticateToken, getTenderEvaluationHandler);

// Award, Override & Closure (SPEC §15, §23)
tenderRouter.post('/:id/award/confirm', authenticateToken, requireRole('ADMIN'), confirmWinnerHandler);
tenderRouter.post('/:id/award/override', authenticateToken, requireRole('ADMIN'), overrideWinnerHandler);
tenderRouter.post('/:id/close', authenticateToken, requireRole('ADMIN'), closeTenderHandler);

// Explainability & Bid Comparison (SPEC §15.4, §15.5, §23)
tenderRouter.get('/:id/explainability', authenticateToken, getExplainabilityHandler);
tenderRouter.get('/:id/compare', authenticateToken, compareBidsHandler);
