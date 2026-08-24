/**
 * Auth Routes (SPEC §23)
 */

import { Router } from 'express';
import { register, login, refresh, logout, me } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, register);
authRouter.post('/login', authRateLimiter, login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.get('/me', authenticateToken, me);
