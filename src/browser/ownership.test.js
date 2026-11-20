import { test, expect } from '@playwright/test';

const fixture = {
  format: 'tcg-local-library-v1', activeGameId: 'own', games: [{
    gameId: 'own', name: '所持モード確認',
    cards: [
      { id: 1, name: '両面カード', isDoubleSided: true, front: { name: '両面カード', image: '', pack: '庭A' }, back: { name: '裏面', image: '', pack: '庭A' }, ownedCount: 2, mockLimit: '0', relatedTokens: ['関連カード'] },
      { id: 2, name: '関連カード', image: '', pack: '庭A', ownedCount: 0 },
      { id: 3, name: '未入力カード', image: '', pack: '庭B' },
    ],
    settings: { labels: ['項目1'], source: 'folder', sideDecks: [{ id: 'side', name: '予備' }] },
    storage: {
      draft: JSON.stringify({ deckName: '作業を保持', deck: [{ id: 1, count: 4 }], sideDecks: { side: [{ id: 2, count: 1 }] }, deckThumbnailCardId: 1 }),
      savedCanvasDecks: JSON.stringify([{ name: '保存A', cards: [{ id: 1, count: 3 }, { id: 2, count: 2 }], sideDecks: { side: [{ id: 1, count: 2 }, { id: 3, count: 1 }] } }, { name: '保存B', cards: [{ id: 1, count: 1 }] }]),
    },
  }],
};
const diskGame = page => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('tcg-local-library-v1', 2);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result, transaction = db.transaction('library'), read = transaction.objectStore('library').get('current');
    transaction.oncomplete = () => { db.close(); resolve(read.result.games.find(game => game.name === '所持モード確認（復元）')); };
  };
}));

for (const width of [1280, 390]) test(`所持枚数モードの仮編集・取消・保存・フィルター・集計 (${width}px)`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const button = name => page.getByRole('button', { name, exact: true });
  await page.goto('/');
  await button('設定').click(); await button('バックアップ').click();
  await page.locator('dialog div:not([hidden]) > section input[type=file]').setInputFiles({ name: 'ownership.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  const before = await diskGame(page);
  const shortages = page.getByRole('region', { name: '所持枚数が足りないカード', exact: true });
  await expect(shortages.locator('.ownership-card')).toHaveCount(2);
  await expect(shortages).toContainText('所持 0枚 ／ 使用 2枚');
  await expect(shortages).not.toContainText('未入力カード');
  await page.screenshot({ path: testInfo.outputPath('ownership-zero-shortages.png'), fullPage: true });
  await button('カード検索').click();
  await button(width === 1280 ? 'フィルター' : 'フィルターを開く').click();
  const filter = page.getByLabel('所持状況', { exact: true });
  const results = page.locator('.ownership-results-heading:visible').first();
  for (const [value, count] of [['owned', 1], ['zero', 1], ['unknown', 1], ['shortage', 2]]) {
    await filter.selectOption(value); await expect(results).toContainText(`${count} 件`);
  }
  await page.getByLabel('収録セット', { exact: true }).selectOption('庭B');
  await expect(results).toContainText('0 件');
  await button(width === 1280 ? 'リセット' : '条件リセット').click();
  await expect(filter).toHaveValue(''); await expect(results).toContainText('3 件');
  await button('増減先：予備').click();
  await button('所持枚数を閲覧・編集').click();
  const mode = page.getByRole('region', { name: '所持枚数編集モード', exact: true });
  await expect(mode).toBeVisible(); await expect(button('設定')).toBeDisabled();
  await expect(button('増減先：予備')).toHaveCount(0);
  const search = page.getByPlaceholder('カード名、項目、テキストで検索');
  await search.fill('両面カード');
  const plus = page.locator('.builder-cards:visible .plusBtn');
  await expect(plus).toBeEnabled(); // Adoption limit is zero, but ownership has no adoption limit.
  await plus.click(); await expect(page.locator('.builder-cards:visible .card-badge')).toHaveText('3');
  await page.locator('.builder-cards:visible img').click();
  const detail = page.locator('.cdm-content');
  await expect(detail.getByLabel('所持枚数', { exact: true })).toHaveValue('3');
  await expect(detail.locator('.cdm-deck-zones')).toHaveCount(0);
  await button('裏面を見る').first().click(); await button('所持枚数を増やす').click();
  await expect(detail.getByLabel('所持枚数', { exact: true })).toHaveValue('4');
  await expect(detail.getByRole('region', { name: '保存デッキでの使用内訳' })).toContainText('保存A · 予備：2枚');
  await button('トークンを見る').click();
  await expect(detail.getByLabel('所持枚数', { exact: true })).toHaveValue('0');
  await expect(detail.getByRole('region', { name: '保存デッキでの使用内訳' })).toContainText('不足 2枚');
  await button('所持枚数を増やす').click();
  await expect(detail.getByLabel('所持枚数', { exact: true })).toHaveCount(1);
  await expect(detail.getByLabel('所持枚数', { exact: true })).toHaveValue('1');
  await page.screenshot({ path: testInfo.outputPath('ownership-detail.png') });
  await button('カード詳細を閉じる').click();
  await button('所持カード').click();
  await expect(page.locator('.ownership-summary')).toContainText('5枚');
  await page.locator('.ownership-summary summary').filter({ hasText: '変更したカード' }).click();
  await expect(page.locator('.ownership-changes')).toContainText('2枚 → 4枚');
  await expect(page.locator('.ownership-changes')).toContainText('0枚 → 1枚');
  await page.screenshot({ path: testInfo.outputPath('ownership-summary.png') });
  expect((await diskGame(page)).cards.map(card => card.ownedCount)).toEqual(before.cards.map(card => card.ownedCount));
  await button('保存デッキ').click();
  await page.locator('.saved-deck-card').filter({ hasText: '保存A' }).click();
  const savedCard = page.locator('.dvm-grid-cell').filter({ has: page.getByRole('img', { name: '両面カード', exact: true }) }).first();
  await expect(savedCard.locator('.dvm-grid-badge')).toHaveText('4');
  await savedCard.click();
  await expect(detail.getByLabel('所持枚数', { exact: true })).toHaveValue('4');
  await button('カード詳細を閉じる').click(); await button('デッキ詳細を閉じる').click();
  await button('🏠').click(); await expect(page.getByRole('combobox', { name: 'ゲーム', exact: true })).toBeDisabled();
  await mode.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await button('作成中デッキ').click();
  await expect(page.locator('#deckNameInput')).toHaveValue('作業を保持');
  await expect(page.locator('.builder-deck-header')).toContainText('メインデッキ: 4枚');
  expect((await diskGame(page)).cards.map(card => card.ownedCount)).toEqual(before.cards.map(card => card.ownedCount));
  await button('カード検索').click(); await expect(button('増減先：予備')).toHaveAttribute('aria-pressed', 'true');
  await button('所持枚数を閲覧・編集').click(); await search.fill('未入力カード');
  await expect(page.locator('.builder-cards:visible .card-badge')).toHaveText('—');
  await plus.click(); await page.locator('.builder-cards:visible .minusBtn').click();
  await expect(page.locator('.builder-cards:visible .card-badge')).toHaveText('0');
  await page.locator('.builder-cards:visible img').click();
  await expect(detail.getByRole('region', { name: '保存デッキでの使用内訳' })).toContainText('不足 1枚');
  await button('未入力に戻す').click();
  await expect(detail.getByLabel('所持枚数', { exact: true })).toHaveValue('');
  await expect(detail.getByRole('region', { name: '保存デッキでの使用内訳' })).not.toContainText('不足');
  await detail.getByLabel('所持枚数', { exact: true }).fill('12');
  await button('カード詳細を閉じる').click();
  await filter.selectOption('unknown'); await expect(results).toContainText('0 件');
  await filter.selectOption('owned'); await expect(results).toContainText('1 件');
  await button('≡').click();
  await page.locator('.builder-cards:visible .minusBtn').click();
  await expect(page.locator('.builder-cards:visible .card-controls')).toContainText('11');
  await page.screenshot({ path: testInfo.outputPath('ownership-search-list.png') });
  if (width === 390) {
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(mode.getByRole('button', { name: '完了', exact: true })).toBeInViewport();
    const bounds = await mode.boundingBox(); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    await page.screenshot({ path: testInfo.outputPath('ownership-320.png') });
  }
  await mode.getByRole('button', { name: '完了', exact: true }).click(); await expect(mode).toHaveCount(0);
  await expect.poll(async () => (await diskGame(page)).cards.find(card => card.id === 3).ownedCount).toBe(11);
  expect((await diskGame(page)).storage).toEqual(before.storage);
  await page.reload(); await button('カード検索').click(); await search.fill('未入力カード');
  await page.locator('.builder-cards:visible img').click(); await expect(detail).toContainText('所持枚数: 11枚');
  await button('編集').click(); await expect(detail.getByLabel('所持枚数', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('所持枚数の保存失敗後も仮編集を保持し、キャンセルと再試行ができる', async ({ page }) => {
  await page.goto('/');
  const button = name => page.getByRole('button', { name, exact: true });
  await button('カード検索').click(); await button('所持枚数を閲覧・編集').click();
  await page.locator('.builder-cards:visible .plusBtn').first().click();
  const installFailure = () => {
    window.failOwnershipSave = false;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.failOwnershipSave && this.name === 'library') throw new DOMException('容量不足', 'QuotaExceededError');
      return put.apply(this, args);
    };
  };
  await page.addInitScript(installFailure); await page.evaluate(installFailure);
  await page.evaluate(() => { window.failOwnershipSave = true; });
  const mode = page.getByRole('region', { name: '所持枚数編集モード', exact: true });
  await button('完了').click(); await expect(mode.getByRole('alert')).toContainText('保存できませんでした');
  await expect(page.locator('.builder-cards:visible .card-badge').first()).toHaveText('1');
  await page.evaluate(() => { window.failOwnershipSave = false; });
  await mode.getByRole('button', { name: 'キャンセル' }).click();
  await button('≡').click(); // Trigger an unrelated autosave after cancellation.
  await page.reload(); await button('カード検索').click(); await button('所持枚数を閲覧・編集').click();
  await page.locator('.builder-cards:visible img').first().click();
  await expect(page.getByLabel('所持枚数', { exact: true })).toHaveValue('');
  await button('所持枚数を増やす').click(); await button('カード詳細を閉じる').click();
  await page.evaluate(() => { window.failOwnershipSave = true; });
  await button('完了').click(); await expect(mode.getByRole('alert')).toContainText('保存できませんでした');
  await page.evaluate(() => { window.failOwnershipSave = false; });
  await button('完了').click(); await expect(mode).toHaveCount(0);
  await page.reload(); await button('カード検索').click(); await page.locator('.builder-cards:visible img').first().click();
  await expect(page.locator('.cdm-content')).toContainText('所持枚数: 1枚');
});
