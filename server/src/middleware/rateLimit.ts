/**
 * Rate Limiting Middleware (SPEC §17.1)
 *
 * 5 requests per 15 minutes per IP on auth endpoints
 */

import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 5, // 5 requests per window in production (SPEC §17.1), relaxed in development
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
  skip: () => process.env.NODE_ENV === 'test', // Skip in automated test environment to prevent false flakes unless specifically tested
});
