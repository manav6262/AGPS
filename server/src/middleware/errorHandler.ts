/**
 * Central Error Handler Middleware (SPEC §17.4)
 *
 * Strips internal stack traces and normalizes error responses.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Input validation failed',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Duplicate key error
  if (err.code === 11000) {
    res.status(409).json({
      error: 'CONFLICT',
      message: 'Resource already exists with unique field conflict',
    });
    return;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.message,
    });
    return;
  }

  // Explicit status codes
  const status = typeof err.status === 'number' ? err.status : 500;
  const message = err.message || 'Internal Server Error';
  const errorCode = err.code && typeof err.code === 'string' ? err.code : 'INTERNAL_SERVER_ERROR';

  res.status(status).json({
    error: errorCode,
    message,
  });
}
