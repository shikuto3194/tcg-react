import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dominantPack, sortSavedDecks, withDeckSaveTimes } from './savedDeckSort.js';

test('空白を含む任意のフォルダ名を同じセットにまとめない',()=>{
  assert.equal(dominantPack([{pack:'第1弾 基本',count:2},{pack:'第1弾 拡張',count:3}]),'第1弾 拡張');
  assert.equal(dominantPack([{pack:' 箱',count:2},{pack:'箱',count:3},{pack:' 箱',count:2}]),' 箱');
});

test('収録弾は種類数ではなく採用枚数で決まり、同数なら先の弾を使う', () => {
  assert.equal(dominantPack([
    { pack: 'SG03 琥珀の庭', count: 3 },
    { pack: 'SG02 燈火の庭', count: 1 },
    { pack: 'SG02 燈火の庭', count: 1 },
    { pack: 'SG01 翠芽の庭', count: 0 },
  ]), 'SG03');
  assert.equal(dominantPack([{ pack: 'SG03', count: 2 }, { pack: 'SG02', count: 2 }]), 'SG02');
  assert.equal(dominantPack([]), null);
});

test('4種類の並び順と昇順・降順を切り替え、元配列は変更しない', () => {
  const decks = [
    { name: 'デッキ10', createdAt: '2026-01-03', updatedAt: '2026-01-04', pack: 'SG02' },
    { name: 'デッキ2', createdAt: '2026-01-02', updatedAt: '2026-01-06', pack: 'SG03' },
    { name: 'デッキ1', createdAt: '2026-01-01', updatedAt: '2026-01-05', pack: 'SG01' },
  ];
  const original = [...decks];
  const expected = { name: [2, 1, 0], created: [2, 1, 0], updated: [0, 2, 1], pack: [2, 0, 1] };
  for (const [key, order] of Object.entries(expected)) {
    for (const direction of ['asc', 'desc']) {
      assert.deepEqual(sortSavedDecks(decks, key, direction, d => [{ pack: d.pack, count: 1 }]),
        (direction === 'asc' ? order : [...order].reverse()).map(i => decks[i]));
    }
  }
  assert.deepEqual(decks, original);
});

test('空デッキは収録順の末尾、古い日時なしデッキは保存順を維持', () => {
  const decks = [{ name: '古い1' }, { name: '古い2' }, { name: '新規', createdAt: '2026-01-01', pack: 'SG02' }];
  assert.deepEqual(sortSavedDecks(decks, 'created', 'asc', () => []), decks);
  assert.deepEqual(sortSavedDecks(decks, 'updated', 'asc', () => []), decks);
  for (const direction of ['asc', 'desc']) {
    assert.equal(sortSavedDecks(decks, 'pack', direction, d => [{ pack: d.pack, count: 1 }])[0].name, '新規');
  }
});

test('新規・上書き・JSON読込で作成日時を維持し更新日時を進める', () => {
  const created = withDeckSaveTimes({ name: 'デッキ' }, undefined, '2026-01-01');
  assert.equal(created.createdAt, '2026-01-01');
  const updated = withDeckSaveTimes({ name: 'デッキ', createdAt: '1999-01-01' }, created, '2026-02-01');
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.updatedAt, '2026-02-01');
  assert.equal(withDeckSaveTimes({ name: '古い' }, { name: '古い' }, '2026-02-01').createdAt, undefined);
});
