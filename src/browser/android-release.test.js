import { test, expect } from '@playwright/test';
import { includesAI } from '../../scripts/ai-build.mjs';

test('Android release has no AI menu, setup calls or resumed connection', async ({ page }, testInfo) => {
  test.skip(includesAI(process.env), 'Requires the Android release frontend build');
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = [], errors = [];
  page.on('request', request => { if (request.url().includes('/__tcg/')) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.nativeCalls = [];
    window.__TAURI_INTERNALS__ = { invoke: async command => { window.nativeCalls.push(command); throw new Error(`Unexpected native call: ${command}`); } };
    sessionStorage.setItem('tcg-ai-session', 'obsolete-connection');
  });
  await page.goto('/#tcg-ai=obsolete-connection');
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: '設定', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('navigation').getByRole('button')).toHaveText(['ゲーム設定›', 'カード追加›', 'バックアップ›']);
    await expect(dialog.getByText('AI連携', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`android-release-settings-${attempt}.png`) });
    if (!attempt) await page.reload();
  }
  expect(await page.evaluate(() => window.nativeCalls)).toEqual([]);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
