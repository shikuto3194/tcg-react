import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('全タブをスワイプで往復し、縦スクロール・入力・ダイアログ・取消では移動しない', async ({ page, context }, info) => {
  await page.goto('/');
  const tabs = ['🏠', 'カード検索', '作成中デッキ', '保存デッキ', '分析'];
  const active = () => page.locator('.tab-btn.active');
  const session = await context.newCDPSession(page);
  const swipe = async (fromX, fromY, toX, toY) => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y: fromY }] });
    for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + (toX - fromX) * step / 8, y: fromY + (toY - fromY) * step / 8 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await expect(active()).toHaveText(tabs[0]);
  await swipe(60, 500, 320, 500); await expect(active()).toHaveText(tabs[0]);
  for (const tab of tabs.slice(1)) { await swipe(320, 500, 60, 500); await expect(active()).toHaveText(tab); }
  await swipe(320, 500, 60, 500); await expect(active()).toHaveText(tabs.at(-1));
  await page.screenshot({ path: info.outputPath('analysis-swipe.png') });
  const before = await page.evaluate(() => window.scrollY);
  await swipe(200, 700, 195, 350);
  await expect(active()).toHaveText('分析');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  // Direct event cases cover cancellation and ignored editable targets deterministically.
  const gesture = async (target, end = 'touchend') => target.evaluate((el, end) => {
    const make = x => new Touch({ identifier: 8, target: el, clientX: x, clientY: 400 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [make(60)], changedTouches: [make(60)] }));
    if (end === 'touchcancel') el.dispatchEvent(new TouchEvent(end, { bubbles: true, touches: [], changedTouches: [make(100)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [make(320)] }));
  }, end);
  await gesture(page.locator('.tab-content:visible'), 'touchcancel'); await expect(active()).toHaveText('分析');
  await page.getByRole('button', { name: 'フィルターを開く', exact: true }).click();
  await gesture(page.locator('#analysis-filters input').first()); await expect(active()).toHaveText('分析');
  await page.getByRole('button', { name: 'フィルターを閉じる', exact: true }).click();
  for (const tab of tabs.slice(0, -1).reverse()) { await swipe(60, 500, 320, 500); await expect(active()).toHaveText(tab); }
  await page.getByRole('button', { name: '戦績を記録', exact: true }).click();
  await gesture(page.getByRole('dialog').locator('h2')); await expect(active()).toHaveText('🏠');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await session.detach();
});

test('ネイティブの複数PDFを1ボタンで保存し、取消・失敗の表示を区別する', async ({ page }, info) => {
  await page.addInitScript(() => {
    window.batchCalls = []; window.batchOutcome = 'cancelled';
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      window.batchCalls.push({ command, args });
      if (command === 'plugin:dialog|open') return window.batchOutcome === 'cancelled' ? null : 'C:/test';
      if (command === 'plugin:path|join') return args.paths.join('/');
      if (command === 'plugin:fs|mkdir' || command === 'plugin:fs|remove' || command === 'plugin:resources|close') return;
      if (command === 'plugin:fs|open') return 1;
      if (command === 'plugin:fs|write') { if (window.batchOutcome === 'failed') throw new Error('容量不足'); return args.data.length; }
      throw new Error(`Unexpected native call: ${command}`);
    } };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '保存デッキ', exact: true }).click();
  await page.locator('.saved-deck-card').first().click(); // Bundled starter has twenty cards: three A4 pages.
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const modal = page.locator('.efm-content');
  await expect(modal.locator('.efm-file-item')).toHaveCount(3);
  await expect(modal.getByRole('link', { name: '保存', exact: true })).toHaveCount(0);
  const save = modal.getByRole('button', { name: 'まとめて保存', exact: true });
  await save.click(); await expect(modal.getByRole('status')).toHaveText('保存を取り消しました。');
  expect(await page.evaluate(() => window.batchCalls.some(x => x.command === 'plugin:fs|open'))).toBe(false);
  await page.evaluate(() => { window.batchCalls = []; window.batchOutcome = 'saved'; });
  await save.click(); await expect(modal.getByRole('status')).toHaveText('3件を保存しました。');
  expect(await page.evaluate(() => window.batchCalls.filter(x => x.command === 'plugin:dialog|open').length)).toBe(1);
  expect(await page.evaluate(() => window.batchCalls.filter(x => x.command === 'plugin:fs|open').length)).toBe(3);
  await page.screenshot({ path: info.outputPath('batch-saved.png') });
  await page.evaluate(() => { window.batchOutcome = 'failed'; });
  await save.click(); await expect(modal.getByRole('alert')).toContainText('3件中0件を保存しました。');
  await expect(modal.getByRole('alert')).toContainText('容量不足');
  await expect(modal.getByRole('status')).toHaveCount(0);
  await modal.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(modal).toHaveCount(0);
});
