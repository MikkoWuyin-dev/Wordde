import { defineConfig } from '@playwright/test';

/**
 * E2E configuration — closes the two verifications that jsdom cannot do
 * (Teardown §8): the Web-Worker decode tier (jsdom has no Worker) and the
 * service-worker offline reload.
 *
 * The suite runs against the PRODUCTION build (`vite preview` serving
 * dist/): the SW registers in prod builds only, and the worker + strict
 * CSP behave differently under the dev server. The webServer starts after
 * `npm run build`, so dist is always fresh.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000, // cold decode of all five translations + offline budget
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4174 --strictPort',
    url: 'http://localhost:4174/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000, // the command runs a full `vite build` first
    stdout: 'pipe', // surface SW registration/diagnostics from the browser console
    stderr: 'pipe',
  },
});
