import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artworkData, createCardArtwork, validateArtwork } from './cardArtwork.js';
import { keysOf } from './cardFields.js';
import { inferCardGame, palettesFor, selectArtworkField } from './cardVocabulary.js';

test('17種の公式用語例で表示名からコスト・主要数値・属性を選ぶ', () => {
  const examples = [
    ['ポケモン', { タイプ: '草', HP: '120', ワザに必要なエネルギー: '草・無色', にげる: '2' }, 'ワザに必要なエネルギー', 'HP'],
    ['Magic', { 色: '赤', 'マナ・コスト': '2RR', 'パワー／タフネス': '4/4' }, 'マナ・コスト', 'パワー／タフネス'],
    ['遊戯王', { 属性: '闇', レベル: '4', ATK: '1800', DEF: '1200' }, undefined, 'ATK'],
    ['ONE PIECE', { 色: '赤', コスト: '5', パワー: '6000', カウンター: '1000' }, 'コスト', 'パワー'],
    ['デュエル・マスターズ', { 文明: '自然', コスト: '4', パワー: '5000', マナ: '1' }, 'コスト', 'パワー'],
    ['デジモン', { 属性: 'ワクチン種', 色: '青', 進化コスト: '2', 登場コスト: '5', 'DP（デジモンパワー）': '6000' }, '登場コスト', 'DP（デジモンパワー）'],
    ['バトルスピリッツ', { 色: '赤', 軽減シンボル: '赤2', コスト: '5', BP: '6000' }, 'コスト', 'BP'],
    ['ヴァンガード', { グレード: '3', パワー: '13000', シールド: '0' }, undefined, 'パワー'],
    ['ヴァイスシュヴァルツ', { 色: '黄', レベル: '1', コスト: '0', パワー: '5000', ソウル: '1' }, 'コスト', 'パワー'],
    ['UNION ARENA', { 色: '青', 必要エナジー: '4', 消費AP: '1', BP: '4000', 発生エナジー: '1' }, '必要エナジー', 'BP'],
    ['Shadowverse EVOLVE', { クラス: 'エルフ', コスト: '2', 攻撃力: '2', 体力: '3' }, 'コスト', '攻撃力'],
    ['WIXOSS', { 色: '白', グロウコスト: '白2', パワー: '10000', リミット: '6' }, 'グロウコスト', 'パワー'],
    ['Lorcana', { 'Ink Type': 'Sapphire', 'Ink Cost': '3', Strength: '2', Willpower: '4', 'Lore Value': '1' }, 'Ink Cost', 'Strength'],
    ['Flesh and Blood', { 'Color Strip': 'Red', Cost: '1', Power: '4', Defense: '3', Pitch: '1' }, 'Cost', 'Power'],
    ['ガンダム', { 色: '青', レベル: '4', コスト: '3', AP: '3', HP: '4' }, 'コスト', 'AP'],
    ['FFTCG', { 属性: '氷', コスト: '4', パワー: '8000' }, 'コスト', 'パワー'],
    ['Force of Will', { Attribute: 'Fire', Cost: 'R2', ATK: '800', DEF: '800' }, 'Cost', 'ATK'],
  ];
  for (const [game, fields, cost, power] of examples) {
    const labels = Object.keys(fields); while (labels.length < 6) labels.push(`項目${labels.length + 1}`);
    const settings = { labels, source: 'folder', cardSize: { width: 63, height: 88 } };
    const face = { name: game, image: '', ...Object.fromEntries(keysOf(settings).map((key, i) => [key, fields[labels[i]] || ''])) };
    const data = artworkData(face, settings);
    assert.equal(data.cost?.label, cost, game); assert.equal(data.power?.label, power, game);
    validateArtwork(face, settings);
    for (const [label, value] of Object.entries(fields)) {
      assert.ok([data.cost?.value, data.power?.value, data.metadata].some(text => text?.includes(value)), `${game} ${label}`);
    }
  }
});

test('紛らわしい略語・補助値を誤分類せず、未定義値と全角英字にも対応する', () => {
  const fields = Object.entries({ 消費AP: '1', 'ＤＰ': '6000', レベル: '5', コスト軽減: '2', 意志力: '3' }).map(([label, value]) => ({ label, value }));
  assert.equal(selectArtworkField(fields, 'cost').label, '消費AP');
  assert.equal(selectArtworkField(fields, 'power').label, 'ＤＰ');
  assert.equal(selectArtworkField([{ label: 'レベル', value: '5' }], 'cost'), undefined);
  assert.equal(selectArtworkField([{ label: 'Willpower', value: '3' }, { label: 'Strength', value: '2' }], 'power').label, 'Strength');
  assert.equal(palettesFor('赤/青/緑').length, 3);
  assert.equal(palettesFor('無色')[0][0], '#596570');
  assert.equal(palettesFor('自然文明')[0][0], '#365c48');
  assert.equal(palettesFor('青い鳥').length, 0);
});

test('カード名・効果という表示名を専用領域で優先し、元の名前・本文も保持する', () => {
  const settings = { labels: ['カード名', '効果', '進化元効果', '属性', 'コスト', 'パワー'], source: 'folder', cardSize: { width: 63, height: 88 } };
  const face = { name: '登録時の名前', color: '表示する名前', type: '味方を守る。', rarity: '攻撃力を上げる。', tribe: '赤/青/緑', cost: '2', reduction: '3000', effect: '補足の本文。' };
  const data = artworkData(face, settings);
  assert.equal(data.title, '表示する名前');
  assert.match(data.metadata, /登録名：登録時の名前/);
  assert.match(data.body, /効果：味方を守る。\n進化元効果：攻撃力を上げる。\nテキスト：補足の本文。/);
  assert.equal(data.colors.length, 3);
  const svg = createCardArtwork(face, settings);
  for (const palette of data.colors) assert.ok(svg.includes(palette[1]));
  validateArtwork(face, settings);
});

test('ゲーム名・略称を補助にして同名項目の意味を分け、明示された表示名を優先する', () => {
  assert.equal(inferCardGame('MTGのカード（復元）'), 'magic');
  assert.equal(inferCardGame('ポケカ'), 'pokemon');
  assert.equal(inferCardGame('自作ファンタジー'), undefined);
  const fields = [{ label: 'AP', value: '2' }, { label: 'HP', value: '4' }];
  assert.equal(selectArtworkField(fields, 'cost', 'ユニアリ').label, 'AP');
  assert.equal(selectArtworkField(fields, 'power', 'ユニアリ').label, 'HP');
  assert.equal(selectArtworkField(fields, 'power', 'ガンダム').label, 'AP');
  assert.equal(selectArtworkField([{ label: '攻撃力', value: '7' }, ...fields], 'power', 'ユニアリ').label, '攻撃力');
  assert.equal(selectArtworkField([{ label: 'マナ', value: '1' }], 'cost', 'デュエマ'), undefined);
  assert.equal(palettesFor('U/B', 'MTG').length, 2);
  assert.equal(palettesFor('闇', 'デュエマ')[0][0], '#3a414b');
  assert.equal(palettesFor('U/B', '自作ゲーム').length, 0);
});
