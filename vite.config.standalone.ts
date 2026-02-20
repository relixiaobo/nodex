/**
 * Standalone Vite config for serving the test page on localhost.
 * Usage: npm run dev:test
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm(), react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT ?? 5199),
    open: '/standalone/index.html',
  },
});
