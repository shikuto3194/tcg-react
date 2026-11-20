import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addImages, applySettings, createGame, editCard, fieldKeys, getGames, getLocalCards, getLocalLimit, getLocalSettings, getLocalStorage, importCardFiles, keysOf, matchesLocalCard, fieldLabel, selectSamples, switchGame, restoreLibrary, snapshotLibrary, valueOf } from './store.js';
import { parseCardData } from './importData.js';

const reset = (mode = 'sample') => { switchGame('sample'); selectSamples(mode); };
const defaults = () => ({ labels: fieldKeys.map((_, i) => `項目${i + 1}`), source: 'folder' });
const image = 'data:image/png;base64,sample';

test('個別編集で上限なし・0・整数を切り替え、不正な値は反映しない', () => {
  reset();
  const first = getLocalCards()[0];
  assert.equal(getLocalLimit(first), Infinity);
  for (const [limit, expected] of [['0', 0], ['5', 5], ['', Infinity]]) {
    editCard(first.id, first.isDoubleSided ? 'front' : null, { limit });
    assert.equal(getLocalLimit(getLocalCards()[0]), expected);
  }
  assert.throws(() => editCard(first.id, null, { limit: '-1' }), /採用上限/);
  assert.throws(() => editCard(first.id, null, { limit: '1.5' }), /採用上限/);
  assert.equal(getLocalLimit(getLocalCards()[1]), Infinity);
});

test('初期6項目、追加・改名後も入力値とIDを保ち、追加項目を検索・セットに使える', () => {
  reset('empty');
  addImages([{ path: '第1弾/カード.png', image }]);
  assert.equal(getLocalSettings().labels.length, 6);
  const settings = defaults();
  settings.labels.push('項目7', '作品名');
  applySettings({ ...settings, source: 'item8' });
  const first = getLocalCards()[0];
  editCard(first.id, null, { item8: '新シリーズ', color: '赤・青', effect: 'テキスト' });
  assert.equal(getLocalCards()[0].pack, '新シリーズ');
  assert.ok(matchesLocalCard(getLocalCards()[0], '新シリーズ', { item8: '新シリーズ' }, '新シリーズ'));
  settings.labels[7] = '収録作品';
  applySettings(settings);
  assert.equal(fieldLabel('item8'), '収録作品');
  assert.equal(getLocalCards()[0].id, first.id);
  assert.equal(valueOf(getLocalCards()[0], 'item8'), '新シリーズ');
  assert.equal(getLocalCards()[0].pack, '第1弾');
  assert.deepEqual(getLocalCards()[0].color, ['赤', '青']);
});

test('画像のみで登録でき、異なるフォルダの同名画像を区別し再読込は重複しない', () => {
  reset('empty');
  assert.equal(addImages([{ path: '第1弾/カード.png', image }, { path: '第2弾/カード.png', image }, { path: 'ルート.png', image }]), 3);
  assert.equal(addImages([{ path: '第1弾/カード.png', image }]), 0);
  const cards = getLocalCards();
  assert.equal(new Set(cards.map(card => card.id)).size, 3);
  assert.deepEqual(cards.map(card => card.pack), ['第1弾', '第2弾', '']);
  assert.ok(fieldKeys.every(key => valueOf(cards[0], key) === ''));
  assert.equal(getLocalLimit(cards[0]), Infinity);
});

test('CSVのBOM・引用符・カンマ・複数行を読み、フォルダ内の画像へ相対パスで対応する', () => {
  reset('empty');
  const rows = parseCardData('\uFEFFimage,name,item1,effect,limit\r\n第1弾/a.png,"カード,A",赤,"1行目\n""説明""",2', 'game/cards.csv');
  assert.deepEqual(importCardFiles([{ path: 'game/第1弾/a.png', image }], rows), { added: 1, updated: 1 });
  const card = getLocalCards()[0];
  assert.equal(card.name, 'カード,A');
  assert.equal(card.effect, '1行目\n"説明"');
  assert.equal(card.pack, '第1弾');
  assert.deepEqual(card.color, ['赤']);
  assert.equal(getLocalLimit(card), 2);
});

test('JSONの再読込はIDを維持し、省略値は保持、空欄は消去する', () => {
  reset('empty');
  const rows = parseCardData('[{"image":"a.png","name":"名前","effect":"本文","item8":"追加値","limit":0}]', 'cards.json');
  importCardFiles([{ path: 'a.png', image }], rows);
  const first = getLocalCards()[0];
  assert.equal(keysOf(getLocalSettings()).length, 8);
  importCardFiles([{ path: 'a.png', image }], parseCardData('{"cards":[{"image":"a.png","effect":"","limit":""}]}', 'cards.json'));
  assert.equal(getLocalCards().length, 1);
  assert.equal(getLocalCards()[0].id, first.id);
  assert.equal(getLocalCards()[0].name, '名前');
  assert.equal(getLocalCards()[0].effect, '');
  assert.equal(getLocalCards()[0].item8, '追加値');
  assert.equal(getLocalLimit(getLocalCards()[0]), Infinity);
});

test('不正なカードデータは途中まで反映せず、画像・設定・既存値を保持する', () => {
  reset('empty');
  addImages([{ path: 'a.png', image }]);
  const before = getLocalCards();
  const rows = parseCardData('[{"image":"a.png","name":"変更","item8":"値"},{"image":"missing.png","name":"失敗"}]', 'cards.json');
  assert.throws(() => importCardFiles([{ path: 'b.png', image }], rows), /カードを確認できません/);
  assert.equal(getLocalCards(), before);
  assert.equal(getLocalSettings().labels.length, 6);
  for (const record of [{ image: 'a.png', cost: '3' }, { image: 'a.png', item1: {} }, { image: 'a.png', item101: '' }, { image: 'a.png', limit: -1 }]) {
    assert.throws(() => importCardFiles([], [{ record, source: 'cards.json' }]));
    assert.equal(getLocalCards(), before);
  }
});

test('CSVの重複見出し・列不足・未閉鎖引用符、デッキJSONは拒否する', () => {
  for (const text of ['image,image\na,b', 'image,name\na', 'image,name\na,"b', 'image,name\na,"b"c']) assert.throws(() => parseCardData(text, 'bad.csv'));
  assert.throws(() => parseCardData('{"name":"deck"}', 'deck.json'));
});

test('両面の片面編集で反対面・画像・ID・関連カード参照を保持する', async () => {
  reset();
  const snapshot = snapshotLibrary();
  snapshot.games = [snapshot.games.find(game=>game.gameId==='sample')];
  const a = snapshot.games[0].cards[0], b = snapshot.games[0].cards[1];
  snapshot.games[0].cards[0] = {...a, isDoubleSided:true, front:{...a},back:{...a,name:'裏面'},relatedTokens:[b.name]};
  await restoreLibrary(snapshot);
  const card = getLocalCards().find(card => card.isDoubleSided);
  editCard(card.id, 'back', { name: '裏面の編集', effect: '裏面の説明', limit: '4' });
  const updated = getLocalCards().find(item => item.id === card.id);
  assert.deepEqual(updated.front, card.front);
  assert.equal(updated.back.image, card.back.image);
  assert.equal(updated.back.name, '裏面の編集');
  assert.equal(getLocalLimit(updated), 4);
  const parent = getLocalCards().find(item => item.relatedTokens?.length);
  const token = getLocalCards().find(item => item.name === parent.relatedTokens[0]);
  editCard(token.id, null, { name: '関連カード改名' });
  assert.ok(getLocalCards().find(item => item.id === parent.id).relatedTokens.includes('関連カード改名'));
});

test('ゲーム切替でカード・設定・保存デッキ・作成中デッキが混ざらず復元される', () => {
  reset('empty');
  addImages([{ path: 'a.png', image }]);
  const storage = getLocalStorage();
  storage.setItem('savedCanvasDecks', JSON.stringify([{ name: 'サンプルのデッキ', cards: [{ id: getLocalCards()[0].id, count: 4 }] }]));
  storage.setItem('draft', JSON.stringify({ deckName: '作成途中', deck: [{ id: getLocalCards()[0].id, count: 5 }] }));
  const settings = defaults(); settings.labels[0] = 'コスト'; applySettings(settings);
  const gameId = createGame('別ゲーム');
  assert.equal(getLocalCards().length, 0);
  assert.equal(getLocalStorage().getItem('savedCanvasDecks'), null);
  assert.equal(fieldLabel('color'), '項目1');
  addImages([{ path: 'a.png', image }]);
  editCard(getLocalCards()[0].id, null, { name: '別ゲームのカード' });
  // 切替前に得た保存先は、切替後も元ゲームを指す。
  storage.setItem('marker', '元のゲーム');
  assert.equal(getLocalStorage().getItem('marker'), null);
  switchGame('sample');
  assert.equal(getLocalCards()[0].name, 'a');
  assert.equal(fieldLabel('color'), 'コスト');
  assert.equal(JSON.parse(getLocalStorage().getItem('draft')).deck[0].count, 5);
  assert.equal(getGames().find(game => game.id === 'sample').decks, 1);
  switchGame(gameId);
  assert.equal(getLocalCards()[0].name, '別ゲームのカード');
  reset();
});
