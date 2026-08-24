/**
 * Tender Routes (SPEC §23)
 */

import { Router } from 'express';
import {
  createTenderHandler,
  getTendersHandler,
  getTenderByIdHandler,
  updateTenderHandler,
  transitionTenderHandler,
} from '../controllers/tenderController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const tenderRouter = Router();

tenderRouter.get('/', authenticateToken, getTendersHandler);
tenderRouter.post('/', authenticateToken, requireRole('ADMIN'), createTenderHandler);
tenderRouter.get('/:id', authenticateToken, getTenderByIdHandler);
tenderRouter.patch('/:id', authenticateToken, requireRole('ADMIN'), updateTenderHandler);
tenderRouter.post('/:id/transition', authenticateToken, requireRole('ADMIN'), transitionTenderHandler);
