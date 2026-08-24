/**
 * Application Environment Configuration (SPEC §17)
 */

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/agps',
  JWT_SECRET: process.env.JWT_SECRET || 'agps_jwt_access_secret_deterministic_key_2026',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'agps_jwt_refresh_secret_deterministic_key_2026',
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
