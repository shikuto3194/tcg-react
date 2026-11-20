import { test, expect } from '@playwright/test';

test('保存失敗を成功表示せず、デッキ名と構築を残して再試行・削除できる', async ({ page }) => {
  const errors = [], dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  await page.goto('/');
  const button = name => page.getByRole('button', { name, exact: true });
  await button('カード検索').click();
  await page.locator('.builder-cards:visible .plusBtn').first().click();
  await button('作成中デッキ').click();
  await page.locator('#deckNameInput').fill('保存失敗の確認');
  await page.evaluate(() => {
    window.failDeckSave = true;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.failDeckSave && this.name === 'library') throw new DOMException('容量不足', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.locator('#saveDeckBtn').click();
  await expect.poll(() => dialogs.at(-1)).toContain('保存できませんでした');
  await expect(page.locator('#deckNameInput')).toHaveValue('保存失敗の確認');
  await button('保存デッキ').click();
  const saved = page.locator('.saved-deck-card').filter({ hasText: '保存失敗の確認' });
  await expect(saved).toHaveCount(0);
  await page.evaluate(() => { window.failDeckSave = false; });
  await button('作成中デッキ').click();
  await page.locator('#saveDeckBtn').click();
  await expect.poll(() => dialogs.at(-1)).toContain('保存しました');
  await button('保存デッキ').click(); await expect(saved).toHaveCount(1);
  await page.evaluate(() => { window.failDeckSave = true; });
  await saved.getByRole('button', { name: '削除', exact: true }).click();
  await expect.poll(() => dialogs.at(-1)).toContain('削除できませんでした');
  await expect(saved).toHaveCount(1);
  await page.evaluate(() => { window.failDeckSave = false; });
  await button('≡').click();
  await page.reload(); await button('保存デッキ').click(); await expect(saved).toHaveCount(1);
  await saved.click();
  await expect(page.locator('.dvm-header')).toContainText('メインデッキ: 1枚');
  await button('デッキ詳細を閉じる').click();
  await saved.getByRole('button', { name: '削除', exact: true }).click();
  await expect.poll(() => dialogs.at(-1)).toContain('削除しました');
  await expect(saved).toHaveCount(0);
  expect(errors).toEqual([]);
});
