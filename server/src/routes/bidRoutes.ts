/**
 * Bid Routes (SPEC §23)
 */

import { Router } from 'express';
import { getBidById, getMyBidsHandler } from '../controllers/bidController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const bidRouter = Router();

bidRouter.get('/mine', authenticateToken, requireRole('VENDOR'), getMyBidsHandler);
bidRouter.get('/:id', authenticateToken, getBidById);
