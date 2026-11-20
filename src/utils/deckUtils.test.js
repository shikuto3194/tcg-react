import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rehydrateCards, sortDeckCards } from './deckUtils.js';
import { comparePacks, packKey, packTitle, cardPack } from './deckPacks.js';

test('保存したカード情報より現在のカタログを使い、枚数・サムネイル・不明IDを保持する', () => {
  const old = [{ id: 1, name: '古い名前', image: 'old', count: 3, isDeckThumbnail: true }, { id: 9, name: '不明カード', count: 2 }];
  const catalog = new Map([[1, { id: 1, name: '最新名', image: 'new', ownedCount: 8, mockLimit: '0' }]]);
  const hydrated = rehydrateCards(old, catalog);
  assert.deepEqual(hydrated[0], { ...catalog.get(1), count: 3, isDeckThumbnail: true });
  assert.equal(hydrated[1], old[1]);
  assert.equal(old[0].name, '古い名前');
  const other = new Map([[1, { id: 1, name: '別ゲーム' }]]);
  assert.equal(rehydrateCards(old, other)[0].name, '別ゲーム');
  assert.equal(rehydrateCards(old, catalog)[0].name, '最新名');
});

test('セット名の空白を保ち、サンプル順・自然順・両面の所属セットを共通にする', () => {
  const names = [' 箱 2', '箱 2', '箱 2 ', '箱 10'];
  assert.deepEqual(names.map(packKey), names);
  assert.deepEqual(names.map(packTitle), names);
  assert.equal(packKey('SG01 翠芽の庭'), 'SG01');
  assert.equal(packTitle('SG01 翠芽の庭'), '翠芽の庭');
  assert.deepEqual(['箱 10', 'SG02 燈火の庭', '箱 2', 'SG01 翠芽の庭'].sort(comparePacks), ['SG01 翠芽の庭', 'SG02 燈火の庭', '箱 2', '箱 10']);
  assert.equal(cardPack({ isDoubleSided: true, front: { pack: '' }, back: { pack: '裏' } }), '裏');
});

test('未入力・文字のコストでもソートを中断せず、セット順と名前で安定して並べる', () => {
  const cards = [{ name: 'B', cost: '任意', pack: '箱 10' }, { name: 'A', pack: '箱 2' }, { name: 'C', cost: '', pack: 'SG01 翠芽の庭' }];
  assert.deepEqual(sortDeckCards(cards).map(card => card.name), ['C', 'A', 'B']);
  assert.deepEqual(cards.map(card => card.name), ['B', 'A', 'C']);
  assert.deepEqual(sortDeckCards([{ name: '後', cost: 2 }, { name: '先', cost: '1' }]).map(card => card.name), ['先', '後']);
  const mixed = [{ name: '数値1', cost: 1, pack: '箱 3' }, { name: '文字', cost: '任意', pack: '箱 2' }, { name: '数値2', cost: 2, pack: '箱 1' }];
  for (const order of [[0, 1, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0], [1, 0, 2], [0, 2, 1]]) {
    assert.deepEqual(sortDeckCards(order.map(index => mixed[index])).map(card => card.name), ['文字', '数値1', '数値2']);
  }
});
