import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeckProfile, getDeckFilterOptions, matchDeckProfile, EMPTY_DECK_FILTERS, profileFromSavedCards } from './savedDeckFilters.js';
import { sortSavedDecks } from './savedDeckSort.js';
import cardData from '../cardData.js';
import { PACK_OPTIONS } from './deckPacks.js';

test('実カードの収録セットがカード番号と一致する', () => {
  const packs = new Map(PACK_OPTIONS.map(pack => [pack.split(' ')[0], pack]));
  for (const card of cardData) {
    for (const face of card.isDoubleSided ? [card.front, card.back] : [card]) {
      assert.equal(face.pack, packs.get(face.cardNumber.split('-')[0]), face.cardNumber);
    }
  }
  const profile = profileFromSavedCards([{ ...cardData[0], count: 3 }]);
  assert.deepEqual(getDeckFilterOptions([profile]).pack, [{ value: 'SG01 翠芽の庭', count: 1 }]);
});

const red = { colors: ['赤'], tribe: '幻想・獣', pack: 'SG01 翠芽の庭' };
const blue = { colors: ['青'], tribe: '鳥／庭', pack: 'SG02 燈火の庭', type: '術式' };
const match = (profile, filters) => matchDeckProfile(profile, { ...EMPTY_DECK_FILTERS, ...filters });

test('候補件数はデッキ単位。0枚・無効枚数を除外し、系統を分割する', () => {
  const first = createDeckProfile([{ count: 30, faces: [red] }, { count: 10, faces: [blue] }, { count: 0, faces: [{ colors: ['緑'] }] }]);
  const second = createDeckProfile([{ count: 3, faces: [red] }, { count: NaN, faces: [blue] }, { count: -1, faces: [blue] }]);
  const options = getDeckFilterOptions([first, second]);
  assert.deepEqual(options.color, [{ value: '赤', count: 2 }, { value: '青', count: 1 }]);
  assert.equal(options.tribe.find(option => option.value === '庭').count, 1);
  assert.equal(options.type.find(option => option.value === '未設定').count, 1);
  assert.deepEqual(getDeckFilterOptions([]).pack, []);
});

test('ヒット度は採用枚数の割合。複数条件はデッキ単位のANDと割合の平均', () => {
  const profile = createDeckProfile([{ count: 30, faces: [red] }, { count: 10, faces: [blue] }]);
  assert.deepEqual(match(profile, { color: '赤' }), { matches: true, score: 0.75 });
  assert.deepEqual(match(profile, { color: '赤', tribe: '庭' }), { matches: true, score: 0.5 });
  assert.equal(match(profile, { tribe: '存在しない' }).matches, false);
  assert.equal(match(profile, { type: '未設定' }).matches, false);
  assert.equal(match(profile, { type: ' 術式 ' }).score, 0.25);
  assert.deepEqual(match(profile, {}), { matches: true, score: null });
});

test('両面・複数系統が一致しても同じカードは一度だけ数え、不明カードは分母に含める', () => {
  const profile = createDeckProfile([{ count: 3, faces: [red, { ...blue, tribe: '幻想／幻想竜' }] }, { count: 1, faces: [] }]);
  assert.equal(profile.total, 4);
  assert.equal(match(profile, { tribe: '幻想' }).score, 0.75);
  assert.equal(match(profile, { color: '多色' }).score, 0.75);
  assert.equal(match(profile, { pack: blue.pack }).score, 0.75);
  assert.equal(match(createDeckProfile([]), { color: '赤' }).matches, false);
  assert.deepEqual(match(createDeckProfile([]), {}), { matches: true, score: null });
});

test('ヒット度で中心デッキを優先し、昇順も選べ、同点・条件なしは保存順を保つ', () => {
  const decks = [{ name: '1枚採用', score: 1 / 40 }, { name: '中心', score: 30 / 40 }, { name: '同点', score: 30 / 40 }];
  assert.deepEqual(sortSavedDecks(decks, 'hit', 'desc', () => [], d => d.score).map(d => d.name), ['中心', '同点', '1枚採用']);
  assert.deepEqual(sortSavedDecks(decks, 'hit', 'asc', () => [], d => d.score), decks);
  assert.deepEqual(sortSavedDecks(decks, 'hit', 'desc', () => []), decks);
});

test('React保存カードから両面の色・パック・種類を復元する', () => {
  const profile = profileFromSavedCards([{ count: 2, isDoubleSided: true, front: { color: ['赤'], tribe: '幻想', pack: red.pack, type: '精霊' }, back: { color: ['青'], pack: blue.pack, type: '術式', name: '術式' } }]);
  assert.equal(match(profile, { type: '術式', color: '青', pack: blue.pack }).score, 1);
});

test('セット名はカード検索と同じ完全一致で扱い、前後の空白や大文字小文字を混ぜない', () => {
  const packs = ['箱 2', ' 箱 2', '箱 2 ', 'SET', 'set'];
  const profile = createDeckProfile(packs.map(pack => ({ count: 1, faces: [{ pack }] })));
  assert.equal(getDeckFilterOptions([profile]).pack.length, packs.length);
  for (const pack of packs) assert.equal(match(profile, { pack }).score, 1 / packs.length);
});
