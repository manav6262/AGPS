/**
 * Department Routes
 */

import { Router } from 'express';
import { listDepartmentsHandler } from '../controllers/departmentController.js';
import { authenticateToken } from '../middleware/auth.js';

export const departmentRouter = Router();

departmentRouter.get('/', authenticateToken, listDepartmentsHandler);
