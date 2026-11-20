import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './src/browser', testMatch: '**/*.test.js', workers: 1, timeout: 90000,
  outputDir: '.codex-temp/playwright',
  use: { baseURL: 'http://127.0.0.1:4187', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4187 --strictPort', url: 'http://127.0.0.1:4187', reuseExistingServer: false },
});
