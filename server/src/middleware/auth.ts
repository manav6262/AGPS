/**
 * Authentication and Role-Based Authorization Middleware (SPEC §17.1, §17.2)
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/security.js';
import { UserRole } from '../models/user.js';

// Extend Express Request type to include user context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload & { id: string };
    }
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Access token is required',
    });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      ...payload,
      id: payload.userId,
    };
    next();
  } catch (err: any) {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: err.name === 'TokenExpiredError' ? 'Access token has expired' : 'Access token is invalid',
    });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Forbidden: requires one of [${allowedRoles.join(', ')}] role`,
      });
      return;
    }

    next();
  };
}
