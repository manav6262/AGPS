/**
 * Server Bootstrap
 */

import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './config/env.js';

async function bootstrap() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB at', env.MONGODB_URI);

    app.listen(env.PORT, () => {
      console.log(`AGPS Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
