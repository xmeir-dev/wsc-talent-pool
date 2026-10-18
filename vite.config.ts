import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The recruiter view lives in view/; the supplied CSVs in data/ are bundled as raw text.
export default defineConfig({
  root: 'view',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true },
});
