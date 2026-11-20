import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { includesAI } from '../../scripts/ai-build.mjs';

for(const width of [1280,390]) test(`search, deck persistence, output and offline start (${width}px)`,async({page,context},testInfo)=>{
  await page.setViewportSize({width,height:width===390?844:800});
  const errors=[],scripts=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.resourceType()==='script')scripts.push(request.url());});
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('/');
  await page.getByRole('button',{name:'カード検索',exact:true}).click();
  await expect(page.getByRole('button',{name:'■',exact:true})).toHaveClass(/active/);
  await page.getByRole('button',{name:'≡',exact:true}).click();
  const search=page.getByPlaceholder('カード名、項目、テキストで検索');
  await search.fill('見つからないカード名');await expect(page.locator('.builder-cards .plusBtn')).toHaveCount(0);
  await search.fill('');
  const image=page.locator('.builder-cards img').first();
  await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(image).toHaveAttribute('src',/\.png\.webp\?v=/);
  await image.evaluate(img=>{img.dataset.identity='retained';});
  await page.locator('.builder-cards .plusBtn').first().click();
  await page.locator('.builder-cards .plusBtn').first().click();
  await expect(image).toHaveAttribute('data-identity','retained');
  await page.screenshot({path:testInfo.outputPath('search.png')});
  await page.getByRole('button',{name:'■',exact:true}).click();
  const gridImage=page.locator('.builder-cards img').first();
  await gridImage.evaluate(img=>{img.dataset.identity='grid-retained';});
  await page.locator('.builder-cards .plusBtn').first().click();
  await page.locator('.builder-cards .minusBtn').first().click();
  await expect(gridImage).toHaveAttribute('data-identity','grid-retained');
  await page.screenshot({path:testInfo.outputPath('grid.png')});
  await page.getByRole('button',{name:'≡',exact:true}).click();
  expect(scripts.some(url=>/jspdf|html2canvas/i.test(url))).toBe(false);
  await page.getByRole('button',{name:'作成中デッキ',exact:true}).click();
  await page.locator('#deckNameInput').fill('ブラウザ確認');await page.locator('#saveDeckBtn').click();
  await page.getByRole('button',{name:'保存デッキ',exact:true}).click();
  await page.locator('.saved-deck-card').filter({hasText:'ブラウザ確認'}).click();
  const jsonDownload=page.waitForEvent('download');await page.getByRole('button',{name:'JSON',exact:true}).click();
  const exported=JSON.parse(await readFile(await(await jsonDownload).path(),'utf8'));expect(exported.cards[0].count).toBe(2);
  expect(exported.cards[0].mockPath).toMatch(/\.png$/);
  // SVG remains the existing hidden export route; PNG uses the same builder.
  const svgDownload=page.waitForEvent('download');await page.getByRole('button',{name:'SVG',exact:true,includeHidden:true}).dispatchEvent('click');
  expect(await readFile(await(await svgDownload).path(),'utf8')).toContain('data:image/webp;base64,');
  const pngDownload=page.waitForEvent('download');await page.getByRole('button',{name:'PNG',exact:true}).click();
  const png=await readFile(await(await pngDownload).path());expect([...png.subarray(0,4)]).toEqual([137,80,78,71]);
  const pdfDownload=page.waitForEvent('download');await page.getByRole('button',{name:'PDF',exact:true}).click();
  expect((await readFile(await(await pdfDownload).path())).subarray(0,4).toString()).toBe('%PDF');
  expect(scripts.some(url=>/jspdf/i.test(url))).toBe(true);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.reload();await page.getByRole('button',{name:'保存デッキ',exact:true}).click();
  await expect(page.locator('.saved-deck-card').filter({hasText:'ブラウザ確認'})).toHaveCount(1);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const offlineReady=await page.evaluate(async()=>{
    const urls=[...document.querySelectorAll('script[src],link[rel="stylesheet"],link[rel="modulepreload"]')].map(node=>node.src||node.href);
    return Promise.all(urls.map(async url=>({url,cached:!!await caches.match(url)})));
  });
  expect(offlineReady.every(asset=>asset.cached)).toBe(true);
  // Prove that the service worker serves the app, without an HTTP-cache fallback.
  const session=await context.newCDPSession(page);
  await session.send('Network.clearBrowserCache');await session.detach();
  await context.setOffline(true);await page.reload();
  await page.getByRole('button',{name:'カード検索',exact:true}).click({timeout:10000});
  await expect.poll(()=>page.locator('.builder-cards img').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('offline.png')});
  expect(errors).toEqual([]);
});

for (const width of [1280, 390]) test(`settings branches and image-free cards, backup and outputs (${width}px)`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/');
  await page.getByRole('combobox', { name: 'ゲーム', exact: true }).selectOption('__add');
  await page.getByRole('dialog').getByLabel('ゲーム名', { exact: true }).fill('編集前のゲーム名');
  await page.getByRole('dialog').getByRole('button', { name: '追加', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('navigation').getByRole('button')).toHaveCount(includesAI(process.env) ? 4 : 3);
  await expect(dialog.getByRole('navigation').getByRole('button', { name: 'AI連携' })).toHaveCount(includesAI(process.env) ? 1 : 0);
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('settings-menu.png') });
  await dialog.getByRole('button', { name: 'ゲーム設定', exact: true }).click();
  await expect(dialog.getByRole('textbox').first()).toHaveValue('編集前のゲーム名');
  await dialog.getByLabel('ゲーム名', { exact: true }).fill('キャンセルする名前');
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await dialog.getByRole('button', { name: 'ゲーム設定', exact: true }).click();
  await expect(dialog.getByLabel('ゲーム名', { exact: true })).toHaveValue('編集前のゲーム名');
  await dialog.getByLabel('ゲーム名', { exact: true }).fill('   ');
  await dialog.getByRole('button', { name: '設定を保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('ゲーム名を入力してください。');
  await dialog.getByLabel('ゲーム名', { exact: true }).fill('画像なしカード検証');
  const names = ['属性', '種類', '希少度', '種族', '召喚コスト', '攻撃力'];
  for (let i = 0; i < names.length; i++) await dialog.locator('form:visible').getByLabel(`項目${i + 1}`, { exact: true }).fill(names[i]);
  await dialog.getByRole('button', { name: '設定を保存', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'ゲーム', exact: true }).locator('option:checked')).toHaveText('画像なしカード検証');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await dialog.getByRole('button', { name: 'カード追加', exact: true }).click();
  const form = dialog.locator('form:visible');
  await expect(form.getByRole('button', { name: 'カードを追加', exact: true })).toBeDisabled();
  const baseText = '登場時、味方の精霊1体を選ぶ。その精霊はこのターン、攻撃力を＋1000する。';
  const shortName = '焔を守る竜騎士', longName = '星を巡る竜騎士と遠い庭の約束';
  const art = [];
  for (const [name, effect, color] of [[shortName, baseText, '火'], [longName, Array(8).fill(baseText).join('\n'), '水']]) {
    await form.getByLabel('カード名（必須）', { exact: true }).fill(name);
    await form.getByLabel('カード番号', { exact: true }).fill('F-001');
    const values = [color, 'ユニット', 'R', '竜騎士', '3', '5000'];
    for (let i = 0; i < names.length; i++) await form.getByLabel(names[i], { exact: true }).fill(values[i]);
    await form.getByLabel('テキスト', { exact: true }).fill(effect);
    await expect(form.getByRole('alert')).toHaveCount(0);
    const preview = form.getByAltText('追加するカードの見本');
    await expect.poll(() => preview.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const url = await preview.getAttribute('src'); art.push(url);
    await preview.screenshot({ path: testInfo.outputPath(`${color === '火' ? 'short' : 'long'}-card.png`) });
    // 実フォントで描かれた文字の矩形を調べ、はみ出し・文字同士の衝突を検出する。
    const geometry = await page.evaluate(src => {
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0';
      host.innerHTML = decodeURIComponent(src.split(',').slice(1).join(',')); document.body.append(host);
      const svg = host.querySelector('svg'), view = svg.viewBox.baseVal;
      const boxes = [...svg.querySelectorAll('text')].filter(node => node.textContent).map(node => {
        const box = node.getBBox(); return { x: box.x, y: box.y, w: box.width, h: box.height, text: node.textContent };
      });
      const result = { width: view.width, height: view.height, boxes }; host.remove(); return result;
    }, url);
    for (const [i, box] of geometry.boxes.entries()) {
      expect(box.x, box.text).toBeGreaterThanOrEqual(0); expect(box.y, box.text).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w, box.text).toBeLessThanOrEqual(geometry.width);
      expect(box.y + box.h, box.text).toBeLessThanOrEqual(geometry.height);
      for (const other of geometry.boxes.slice(i + 1)) {
        expect(box.x < other.x + other.w && other.x < box.x + box.w && box.y < other.y + other.h && other.y < box.y + box.h, `${box.text} / ${other.text}`).toBe(false);
      }
    }
    await form.getByRole('button', { name: 'カードを追加', exact: true }).click();
    await expect(form.getByRole('status')).toHaveText('カードを追加しました。');
  }
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'カード検索', exact: true }).click();
  await page.getByRole('button', { name: '■', exact: true }).click();
  for (const image of await page.locator('.builder-cards img').all()) await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.locator('.builder-cards .plusBtn').nth(0).click();
  await page.locator('.builder-cards .plusBtn').nth(1).click();
  await page.screenshot({ path: testInfo.outputPath('generated-grid.png') });
  await page.getByRole('button', { name: '作成中デッキ', exact: true }).click();
  await page.locator('#deckNameInput').fill('画像なしのデッキ'); await page.locator('#saveDeckBtn').click();
  await page.getByRole('button', { name: '保存デッキ', exact: true }).click();
  await page.locator('.saved-deck-card').filter({ hasText: '画像なしのデッキ' }).click();
  for (const format of ['SVG', 'PNG', 'PDF', 'JSON']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: format, exact: true, includeHidden: true }).dispatchEvent('click');
    const file = await download; await file.saveAs(testInfo.outputPath(`generated.${format.toLowerCase()}`));
    const bytes = await readFile(await file.path());
    if (format === 'SVG') expect(bytes.toString()).toContain('data:image/svg+xml;');
    if (format === 'PNG') {
      const stats = await sharp(bytes).stats(); expect(stats.channels[0].stdev).toBeGreaterThan(15);
    }
    if (format === 'PDF') { expect(bytes.subarray(0, 4).toString()).toBe('%PDF'); expect(bytes.length).toBeGreaterThan(5000); }
    if (format === 'JSON') expect(JSON.parse(bytes).cards.every(card => card.image === '')).toBe(true);
  }
  await page.getByLabel('デッキ詳細を閉じる').click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await dialog.getByRole('button', { name: 'バックアップ', exact: true }).click();
  const downloaded = page.waitForEvent('download'); await dialog.getByRole('button', { name: '画像込みバックアップ', exact: true }).click();
  const backup = await readFile(await (await downloaded).path());
  expect(JSON.parse(backup).games.find(game => game.name === '画像なしカード検証').cards.every(card => card.image === '')).toBe(true);
  await dialog.locator('div:not([hidden]) > section input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await expect(dialog).toHaveCount(0);
  await page.getByRole('combobox', { name: 'ゲーム', exact: true }).selectOption({ label: '画像なしカード検証（復元）' });
  await page.reload();
  await page.getByRole('button', { name: 'カード検索', exact: true }).click();
  const restored = page.locator('.builder-cards img:visible');
  await expect(restored).toHaveCount(2);
  for (const image of await restored.all()) expect(art).toContain(await image.getAttribute('src'));
  expect(errors).toEqual([]);
});
