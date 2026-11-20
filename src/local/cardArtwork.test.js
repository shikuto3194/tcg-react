import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artworkData, createCardArtwork, layoutArtwork, validateArtwork, wrapArtworkText } from './cardArtwork.js';
import { addCard, applySettings, createGame, editCard, exportLibrary, getLocalCards, getLocalSettings, importCardFiles, initializeLibrary, flushLibrary, snapshotLibrary } from './store.js';
import { openLibrary } from './persistence.js';
import { IDBFactory } from 'fake-indexeddb';
import { parseCardData } from './importData.js';
import { validateLibrary } from './backup.js';
import { makeDeckJson, prepareDeckImport } from './deckJson.js';

const settings = { labels: ['属性', '種類', '希少度', '種族', 'コスト', 'パワー', '収録セット', '備考'], source: 'symbol', sideDecks: [], cardSize: { width: 63, height: 88 } };
const face = { name: '焔を守る竜騎士', image: '', color: ['火'], type: 'ユニット', rarity: 'R', tribe: '竜騎士', cost: '3', reduction: ['5000'], symbol: ['第1弾'], item8: '進化可能', pack: '第1弾', cardNumber: 'F-001', effect: '登場時、味方1体を選ぶ。その味方はこのターン、力を＋1000する。' };

test('表示名を優先して役割を選び、残る全項目・番号・セットも画像に含める', () => {
  const moved = { ...settings, labels: ['コスト軽減', '召喚コスト', '攻撃力（ATK）', '属性', '分類', 'メモ', '収録セット', '備考'] };
  const data = artworkData({ ...face, color: ['9'], type: '2', rarity: '8000', tribe: '青', cost: '人物' }, moved);
  assert.equal(data.cost.value, '2'); assert.equal(data.power.value, '8000');
  assert.equal(data.colors[0][0], '#305768');
  assert.match(data.metadata, /コスト軽減：9/); assert.match(data.metadata, /分類：人物/);
  const svg = createCardArtwork(face, settings);
  for (const text of ['焔を守る竜騎士', '属性：火', '種類：ユニット', '希少度：R', '種族：竜騎士', 'コスト  3', 'パワー  5000', '収録セット：第1弾', '備考：進化可能', 'カード番号：F-001']) assert.ok(svg.includes(text), text);
  assert.doesNotMatch(svg, /<circle|<button|onclick|foreignObject|<image/);
  assert.match(createCardArtwork({ ...face, name: '<script>&"' }, settings), /&lt;script&gt;&amp;&quot;/);
});

test('短文は縮小・移動せず、長文だけ本文を引き上げ、各領域を離して全文を保つ', () => {
  const short = layoutArtwork(face, settings);
  assert.equal(short.body.y, short.height * 0.54); assert.equal(short.body.size, 30); assert.equal(short.name.size, 55);
  const longFace = { ...face, effect: face.effect.repeat(9) };
  validateArtwork(longFace, settings);
  const long = layoutArtwork(longFace, settings);
  assert.ok(long.body.y < short.body.y);
  assert.equal(long.body.lines.join(''), longFace.effect);
  for (const layout of [short, long]) {
    assert.ok(layout.cost.y + layout.cost.h < layout.name.y);
    assert.ok(layout.name.y + layout.name.h < layout.metadata.y);
    assert.ok(layout.metadata.y + layout.metadata.h < layout.divider);
    assert.ok(layout.divider < layout.body.y);
    assert.ok(layout.body.y + layout.body.h < layout.power.y);
    assert.ok(layout.power.y + layout.power.h < layout.height);
    assert.ok(layout.name.fits && layout.body.fits && layout.power.fits);
  }
  assert.throws(() => validateArtwork({ ...face, effect: '長文'.repeat(2000) }, settings), /収まりません/);
});

test('明示改行・欧文単語・結合文字を保ち、横長・長い名前でも枠内で配置する', () => {
  const lines = wrapArtworkText('先頭\n「ひとつの効果」\nA long English sentence 👩‍🚀が', 150, 24);
  assert.equal(lines.join(''), '先頭「ひとつの効果」A long English sentence 👩‍🚀が');
  assert.ok(lines.includes('先頭')); assert.ok(lines.some(line => line.includes('👩‍🚀')));
  const wide = { ...settings, cardSize: { width: 90, height: 60 } };
  const card = { name: '長い名前のカードを中央に配置するための横長カード', effect: '第一段落。\n次の段落です。' };
  validateArtwork(card, wide);
  const layout = layoutArtwork(card, wide);
  assert.ok(layout.name.lines.length > 1); assert.ok(layout.name.fits && layout.body.fits);
});

test('名前必須で画像なし登録・CSV/JSON追加更新を一括反映し、失敗時は変更しない', () => {
  createGame('画像なし');
  assert.throws(() => addCard({ name: '  ' }), /カード名/);
  const id = addCard({ name: 'カード名だけ' });
  assert.equal(getLocalCards()[0].id, id); assert.match(getLocalCards()[0].image, /^data:image\/svg\+xml/);
  applySettings(settings);
  const records = parseCardData('name,item1,item5,item6,effect\n炎の精霊,火,0,1000,味方を守る。', 'cards.csv');
  assert.deepEqual(importCardFiles([], records), { added: 1, updated: 1 });
  const card = getLocalCards()[0], original = card.image;
  importCardFiles([], parseCardData(JSON.stringify([{ id: card.id, name: '炎の守り手', item1: '水' }]), 'cards.json'));
  assert.equal(getLocalCards().length, 2); assert.equal(getLocalCards()[0].id, card.id);
  assert.notEqual(getLocalCards()[0].image, original);
  const before = snapshotLibrary();
  assert.throws(() => importCardFiles([], parseCardData('[{"name":"途中"},{"name":""}]', 'cards.json')), /カード名/);
  assert.deepEqual(snapshotLibrary(), before);
  assert.throws(() => editCard(card.id, null, { effect: '文'.repeat(5000) }), /収まりません/);
  assert.deepEqual(snapshotLibrary(), before);
});

test('画像なしカードの原データを保存・バックアップ・JSONに保ち、再読込時に画像を再生成する', async () => {
  const factory = new IDBFactory(); let db = await openLibrary(factory);
  await initializeLibrary(db); const game = createGame('画像なしの保存'); applySettings(settings);
  addCard({ ...face, color: 'U', reduction: '5000', symbol: '第1弾' });
  const originalImage = getLocalCards()[0].image, original = snapshotLibrary();
  assert.throws(() => applySettings({ ...settings, labels: settings.labels.map(() => '変更') }, '  '), /ゲーム名/);
  assert.deepEqual(snapshotLibrary(), original);
  applySettings(settings, ' MTG ');
  const rendered = getLocalCards()[0];
  assert.notEqual(rendered.image, originalImage);
  assert.equal(snapshotLibrary().activeGameId, game);
  assert.deepEqual(snapshotLibrary().games.find(item => item.gameId === game).cards, original.games.find(item => item.gameId === game).cards);
  const deck = makeDeckJson({ name: '生成デッキ', cards: [{ id: rendered.id, count: 2 }] }, settings, getLocalCards());
  assert.equal(deck.cards[0].image, ''); assert.equal(deck.cards[0].generatedArtwork, undefined);
  assert.equal(prepareDeckImport(deck, settings, getLocalCards()).cards[0].image, rendered.image);
  assert.throws(() => prepareDeckImport(deck, settings, [{ ...rendered, name: '別カード' }]), /カードを確認/);
  const backup = await exportLibrary(async () => 'data:image/png;base64,aGVsbG8=');
  assert.equal(backup.games.find(item => item.gameId === game).cards[0].image, '');
  assert.equal(backup.games.find(item => item.gameId === game).name, 'MTG');
  validateLibrary(backup);
  const invalid = structuredClone(backup); invalid.games.find(item => item.gameId === game).cards[0].image = rendered.image;
  assert.throws(() => validateLibrary(invalid), /形式/); // 外から渡されたSVGは実行しない。
  await flushLibrary(); db.close(); db = await openLibrary(factory); await initializeLibrary(db);
  assert.equal(getLocalCards()[0].image, rendered.image); assert.deepEqual(getLocalSettings(), settings);
  assert.equal(snapshotLibrary().games.find(item => item.gameId === game).name, 'MTG'); db.close();
});
