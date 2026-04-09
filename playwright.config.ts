import { defineConfig, devices } from '@playwright/test';

const host = process.env.PW_HOST ?? '127.0.0.1';
const port = parseInt(process.env.PW_PORT ?? '4321', 10);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${port}`;

const skipWebServer = !!process.env.PW_SKIP_WEB_SERVER;
const useFastDev = !!process.env.PW_FAST;
const legacyReference = !!process.env.PW_LEGACY_REFERENCE;

const legacyBaseURL =
  (process.env.LEGACY_SITE_URL ?? 'https://loppkartan.se').replace(/\/?$/, '') + '/';
const webServerEnv = {
  ...process.env,
  PUBLIC_SUPABASE_URL:
    process.env.PUBLIC_SUPABASE_URL ?? 'https://race-aggregator-tests.supabase.co',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_test',
};

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['legacy/**'],
      use: { ...devices['Desktop Chrome'], baseURL },
    },
    ...(legacyReference
      ? [
          {
            name: 'legacy-reference',
            testDir: 'tests/legacy',
            use: {
              ...devices['Desktop Chrome'],
              baseURL: legacyBaseURL,
              navigationTimeout: 60_000,
              actionTimeout: 30_000,
            },
            expect: { timeout: 60_000 },
          },
        ]
      : []),
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: useFastDev
            ? `npx astro dev --host ${host} --port ${port}`
            : `npm run build && npx astro preview --host ${host} --port ${port}`,
          env: webServerEnv,
          url: `${baseURL}/loppkalender/`,
          reuseExistingServer: !process.env.CI,
          timeout: useFastDev ? 180_000 : 300_000,
          stdout: 'inherit',
          stderr: 'inherit',
        },
      }),
});
