import { Router } from 'express';
import {
  createTenderHandler,
  getTendersHandler,
  getTenderByIdHandler,
  updateTenderHandler,
  transitionTenderHandler,
} from '../controllers/tenderController.js';
import { submitBidHandler, getTenderBidsHandler } from '../controllers/bidController.js';
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
