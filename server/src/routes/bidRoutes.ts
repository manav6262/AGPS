/**
 * Bid Routes (SPEC §23)
 */

import { Router } from 'express';
import { getBidById } from '../controllers/bidController.js';
import { authenticateToken } from '../middleware/auth.js';

export const bidRouter = Router();

bidRouter.get('/:id', authenticateToken, getBidById);
