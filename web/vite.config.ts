import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for NextProblem
// base: './' ensures relative asset paths for GitHub Pages subfolder hosting
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    open: false
  }
});
