/**
 * Officer Management Routes (SPEC & change01.md §4, §5)
 */

import { Router } from 'express';
import {
  createOfficerHandler,
  listOfficersHandler,
  updateOfficerStatusHandler,
  updateOfficerDepartmentHandler,
} from '../controllers/officerController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const officerRouter = Router();

officerRouter.use(authenticateToken);
officerRouter.use(requireRole('SUPER_ADMIN'));

officerRouter.post('/', createOfficerHandler);
officerRouter.get('/', listOfficersHandler);
officerRouter.patch('/:id/status', updateOfficerStatusHandler);
officerRouter.patch('/:id/department', updateOfficerDepartmentHandler);
