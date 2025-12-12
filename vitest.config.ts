import { defineConfig } from 'vitest/config';

// Vitest configuration for core TypeScript modules.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});

