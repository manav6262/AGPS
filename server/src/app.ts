/**
 * Express Application Setup (SPEC §17)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { authRouter } from './routes/authRoutes.js';
import { bidRouter } from './routes/bidRoutes.js';
import { tenderRouter } from './routes/tenderRoutes.js';
import { vendorRouter } from './routes/vendorRoutes.js';
import { dashboardSummaryHandler } from './controllers/sensitivityController.js';
import { authenticateToken, requireRole } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

// Security middleware (SPEC §17.1)
app.use(helmet());

// CORS allowlist configuration (SPEC §17.1)
// CORS_ORIGIN accepts a comma-separated list so a deployed frontend origin
// can be added without a code change. Trailing slashes are stripped because
// browsers send the Origin header without one.
const allowedOrigins = [
  ...env.CORS_ORIGIN.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server or test requests without origin
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

// Health Check
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'OK', service: 'AGPS Backend', timestamp: new Date().toISOString() });
});

// Admin-only test endpoint (for Test 32)
app.get('/api/admin/dashboard', authenticateToken, requireRole('ADMIN'), (_req, res) => {
  res.status(200).json({ message: 'Welcome Admin' });
});

// Dashboard Summary endpoint
app.get('/api/dashboard/summary', authenticateToken, dashboardSummaryHandler);

// Mount Routes
app.use('/api/auth', authRouter);
app.use('/api/bids', bidRouter);
app.use('/api/tenders', tenderRouter);
app.use('/api/vendors', vendorRouter);

// Central error handler (SPEC §17.4)
app.use(errorHandler);
