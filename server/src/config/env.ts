/**
 * Application Environment Configuration (SPEC §17)
 */

import dotenv from 'dotenv';
import path from 'path';

// Load from current directory .env, or fallback to server/.env if run from workspace root
dotenv.config();
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.resolve(process.cwd(), 'server', '.env') });
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Copy server/.env.example to server/.env and fill it in.`
    );
  }
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '5000', 10),
  MONGODB_URI: required('MONGODB_URI'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
};

if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be distinct.');
}
