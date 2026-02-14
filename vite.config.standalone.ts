/**
 * Standalone Vite config for serving the test page on localhost.
 * Usage: npm run dev:test
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT ?? 5199),
    open: '/standalone/index.html',
  },
});
