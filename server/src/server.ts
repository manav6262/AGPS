/**
 * Server Bootstrap
 */

import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './config/env.js';

/** Strip credentials so the connection string is safe to log. */
function redact(uri: string): string {
  return uri.replace(/\/\/[^@]+@/, '//***:***@');
}

async function bootstrap() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB at', redact(env.MONGODB_URI));

    // Bind 0.0.0.0 so container platforms (Render) can route to the process.
    app.listen(env.PORT, '0.0.0.0', () => {
      console.log(`AGPS Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
