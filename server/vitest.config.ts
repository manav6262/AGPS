import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    hookTimeout: 300000,
    testTimeout: 60000,
    env: {
      MONGODB_URI: 'mongodb://localhost:27017/agps_test',
      JWT_SECRET: 'test_jwt_secret_32_characters_long_key_1',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_chars_long_key_2',
    },
  },
});
