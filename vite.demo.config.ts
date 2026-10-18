import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The HubSpot → Comeet integration concept lives in integration-demo/; it reuses pipeline/ and data/.
export default defineConfig({
  root: 'integration-demo',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist-demo', emptyOutDir: true },
});
