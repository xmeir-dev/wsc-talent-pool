import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Pipeline tests run in Node; view component tests opt into jsdom with a file docblock.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
