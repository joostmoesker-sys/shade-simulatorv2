import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The 3DBAG OGC API (api.3dbag.nl) does not send Access-Control-Allow-Origin,
// so the browser blocks direct fetches of the LoD2.2 CityJSON tiles and the
// building import silently degrades to flat 2D footprints. Proxying the API
// through the dev/preview server makes the request same-origin, which removes
// CORS from the equation entirely (no flaky public CORS proxies needed).
// The proxy target can be overridden (e.g. for integration testing against a
// local stub) via the THREE_D_BAG_PROXY_TARGET environment variable. Read via
// globalThis so this config type-checks without Node type definitions.
const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const threeDBagProxy = {
  '/api/3dbag': {
    target: nodeEnv?.THREE_D_BAG_PROXY_TARGET ?? 'https://api.3dbag.nl',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/3dbag/, ''),
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: threeDBagProxy,
  },
  preview: {
    proxy: threeDBagProxy,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});
