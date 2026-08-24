/**
 * Security & Token Utilities (SPEC §17.1)
 *
 * bcrypt cost 12
 * JWT 15-minute access token + 7-day refresh token
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UserRole } from '../models/user.js';

export const BCRYPT_SALT_ROUNDS = 12;

export interface TokenPayload {
  userId: string;
  role: UserRole;
  email: string;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}
