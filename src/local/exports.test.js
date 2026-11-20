import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CARD_SIZE, expandPrintImages, getImageLayout, getPrintLayout, normalizeCardSize } from './cardSize.js';
import { buildPrintPdfs } from './exports.js';
import { makeDeckJson, prepareDeckImport } from './deckJson.js';
import { applySettings, createGame, getLocalSettings, selectSamples, switchGame } from './store.js';

test('PDFは19枚以上でも採用数を減らさず、両面を各枚数分配置する', () => {
  const images = expandPrintImages({ cards: [{ image: 'a', count: 19 }, { isDoubleSided: true, front: { image: 'front' }, back: { image: 'back' }, count: 3 }, { image: 'zero', count: 0 }] });
  assert.equal(images.length, 25);
  assert.equal(images.filter(src => src === 'a').length, 19);
  assert.equal(images.filter(src => src === 'front').length, 3);
  assert.equal(images.filter(src => src === 'back').length, 3);
});

test('指定mmサイズのままA4内へ配置し、用紙に合わせた縮小は行わない', () => {
  for (const [size, perPage] of [[DEFAULT_CARD_SIZE, 9], [{ width: 63, height: 88 }, 9], [{ width: 90, height: 60 }, 8], [{ width: 190, height: 277 }, 1]]) {
    const layout = getPrintLayout(size);
    assert.equal(layout.perPage, perPage);
    assert.equal(layout.width, size.width);
    assert.equal(layout.height, size.height);
    assert.ok(layout.x >= 10 && layout.y >= 10);
    assert.ok(layout.x + layout.columns * layout.width <= 200.0001);
    assert.ok(layout.y + layout.rows * layout.height <= 287.0001);
    const image = getImageLayout(size);
    assert.ok(Math.abs((image.cellW - 8) / (image.cellH - 8) - size.width / size.height) < 1e-10);
    assert.ok(Math.abs(image.thumbW / image.thumbH - size.width / size.height) < 1e-10);
  }
  for (const size of [{ width: '', height: 87 }, { width: 0, height: 87 }, { width: 60, height: NaN }, { width: 191, height: 87 }]) assert.throws(() => normalizeCardSize(size), /カードサイズ/);
});

test('PDF実生成でも25画像を3ページに配置し、画像読込は重複せず失敗時に中断する', async () => {
  // 同梱カード画像を使い、PDF内部の描画命令数を確認する。
  const png = 'data:image/png;base64,' + (await readFile(new URL('../../images/starlit/01.png', import.meta.url))).toString('base64');
  let loaded = 0;
  const files = await buildPrintPdfs({ name: 'test', cards: [{ image: 'a', count: 25 }] }, { width: 63, height: 88 }, async () => { loaded++; return png; });
  assert.equal(loaded, 1);
  assert.equal(files.length, 3);
  assert.deepEqual(files.map(file => file.name), ['test-1_3.pdf', 'test-2_3.pdf', 'test-3_3.pdf']);
  assert.deepEqual(files.map(file => (file.doc.internal.pages[1].join('\n').match(/\/I\d+ Do/g) || []).length), [9, 9, 7]);
  await assert.rejects(buildPrintPdfs({ cards: [{ image: 'missing', count: 1 }] }, DEFAULT_CARD_SIZE, async () => { throw new Error('missing'); }), /missing/);
});

test('カードサイズはゲーム別で保持し、不正な設定では既存値を変更しない', () => {
  switchGame('sample'); selectSamples('empty');
  applySettings({ ...getLocalSettings(), cardSize: { width: 63, height: 88 } });
  const another = createGame('カードサイズ確認');
  assert.deepEqual(getLocalSettings().cardSize, DEFAULT_CARD_SIZE);
  applySettings({ ...getLocalSettings(), cardSize: { width: 90, height: 60 } });
  switchGame('sample');
  assert.deepEqual(getLocalSettings().cardSize, { width: 63, height: 88 });
  assert.throws(() => applySettings({ ...getLocalSettings(), cardSize: { width: -1, height: 87 } }));
  assert.deepEqual(getLocalSettings().cardSize, { width: 63, height: 88 });
  switchGame(another);
  assert.deepEqual(getLocalSettings().cardSize, { width: 90, height: 60 });
  switchGame('sample'); selectSamples('sample');
});

test('JSONにサイズを記録し、同じ設定なら画像パスでデッキを復元する', () => {
  const settings = { labels: ['コスト'], source: 'folder', cardSize: { width: 63, height: 88 } };
  const cards = [{ id: 1, name: 'a', mockPath: '第1弾/a.png', mockLimit: '' }];
  const json = JSON.parse(JSON.stringify(makeDeckJson({ name: 'deck', cards: [{ ...cards[0], count: 4 }], thumbnailCardId: 1 }, settings, cards)));
  assert.deepEqual(json.localSettings.cardSize, settings.cardSize);
  const imported = prepareDeckImport(json, settings, [{ ...cards[0], id: 99 }]);
  assert.equal(imported.cards[0].id, 99);
  assert.equal(imported.cards[0].count, 4);
  assert.equal(imported.thumbnailCardId, 99);
  assert.throws(() => prepareDeckImport(json, { ...settings, cardSize: DEFAULT_CARD_SIZE }, cards), /同じ設定/);
  assert.throws(() => prepareDeckImport(json, { ...settings, labels: ['パワー'] }, cards), /同じ設定/);
  assert.throws(() => prepareDeckImport(json, settings, [{ ...cards[0], mockPath: '違う.png' }]), /同じカードデータ/);
  const tokenJson = makeDeckJson({ name: 'tokens', cards: [], tokenDeck: [{ id: 1, count: 9 }], thumbnailCardId: 1 }, settings, cards);
  const tokenImported = prepareDeckImport(JSON.parse(JSON.stringify(tokenJson)), settings, [{ ...cards[0], id: 99 }]);
  assert.equal(tokenImported.tokenDeck[0].id, 99);
  assert.equal(tokenImported.tokenDeck[0].count, 9);
  assert.equal(tokenImported.thumbnailCardId, 99);
});

test('ローカル版からURL共有・自動読込・旧PDFの枚数間引きを取り除く', async () => {
  const code = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
  for (const removed of ['getShareUrl', 'encodeDeckToQuery', 'decodeDeckFromQuery', "params.get('deck')", 'デッキ共有URL', 'Math.ceil(count / 3)', 'Math.ceil(tokenCount / 3)']) assert.ok(!code.includes(removed), removed);
  assert.ok(code.includes('prepareDeckImport(JSON.parse(text)'));
  assert.ok(code.includes('buildPrintPdfs(current, getLocalSettings().cardSize)'));
});
