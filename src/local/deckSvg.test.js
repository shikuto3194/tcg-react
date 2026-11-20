import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildDeckSVG } from './deckSvg.js';

test('SVGは指定カタログと設定から描画し、サイドの枚数・色・mm寸法・エスケープを保持する', async () => {
  const settings = { cardSize: { width: 63, height: 88 }, sideDecks: [{ id: 'side', name: '予備<&>', color: '#123456' }] };
  const catalog = new Map([[1, { id: 1, name: '最新', image: 'new' }], [2, { id: 2, isDoubleSided: true, front: { name: '表', image: 'front' }, back: { name: '裏', image: 'back' } }]]);
  const deck = { name: '<タイトル&>', cards: [{ id: 1, image: 'old', count: 3 }], sideDecks: { side: [{ id: 2, count: 2 }] }, thumbnailCardId: 2 };
  const loaded = [];
  const built = await buildDeckSVG(deck, settings, catalog, async src => { loaded.push(src); return `data:image/png;base64,${src}`; });
  assert.deepEqual(loaded, ['front', 'new', 'front']);
  const dom = new JSDOM(built.svg, { contentType: 'image/svg+xml' });
  const svg = dom.window.document.documentElement;
  assert.equal(svg.getAttribute('width'), `${built.width / 2}mm`);
  assert.equal(svg.getAttribute('height'), `${built.height / 2}mm`);
  assert.ok(svg.textContent.includes('<タイトル&>'));
  assert.ok(svg.textContent.includes('予備<&> (2枚)'));
  assert.ok(svg.textContent.includes('メインデッキ3枚'));
  assert.deepEqual([...svg.querySelectorAll('circle')].map(node => node.getAttribute('fill')), ['#1976d2', '#123456']);
  const face = svg.querySelectorAll('image')[1];
  assert.equal(Number(face.getAttribute('width')) / Number(face.getAttribute('height')), 63 / 88);
  dom.window.close();
  await assert.rejects(buildDeckSVG(deck, settings, catalog, async () => { throw new Error('画像なし'); }), /画像なし/);
});
