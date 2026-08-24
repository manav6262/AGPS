/**
 * Vendor Routes (SPEC §23)
 */

import { Router } from 'express';
import {
  getMyVendorProfileHandler,
  updateMyVendorProfileHandler,
} from '../controllers/vendorController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const vendorRouter = Router();

vendorRouter.get('/me/profile', authenticateToken, requireRole('VENDOR'), getMyVendorProfileHandler);
vendorRouter.patch('/me/profile', authenticateToken, requireRole('VENDOR'), updateMyVendorProfileHandler);
