import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openLibrary } from '../local/persistence.js';
import { initializeLibrary, createGame, switchGame, getEvents, putEvent, removeEvent, flushLibrary, snapshotLibrary, exportLibrary, restoreLibrary } from '../local/store.js';
import { LIBRARY_FORMAT, validateLibrary } from '../local/backup.js';
import { validateEvents } from './validation.js';
import { createEvent, createMatch, createGameRecord, snapshotDeck, recordText, allRecords } from './model.js';

const legacy = () => ({ format: LIBRARY_FORMAT, activeGameId: 'old', games: [{ gameId: 'old', name: '以前のゲーム', cards: [], settings: { labels: ['色', '種類', '希少度', '種族', 'コスト', '力'], source: 'folder' }, storage: { savedCanvasDecks: '[]' } }] });
const eventFixture = () => ({ ...createEvent(), name: '同名大会', rounds: '2', playoff: 'yes', format: 'BO3', qualifyingRank: '3', finalRank: 'ベスト8', matches: [{ ...createMatch(), deckName: '当時の構築', opponent: '手入力の相手', result: 'win', score: '2-1', cards: [{ id: 999, count: 2 }] }, { ...createMatch('playoff', 1), label: '準決勝', memo: '勝敗は不明' }] });

test('複数の登録デッキとゲーム内訳を再接続・別ゲーム復元でも保持し、旧記録を推測で分割しない', async () => {
  const factory = new IDBFactory(); let db = await openLibrary(factory);
  await db.write(legacy()); await initializeLibrary(db);
  const saved = { name: '構築A', cards: [{ id: 99, count: 2 }], sideDecks: { side: [{ id: 98, count: 1 }] } };
  const deck = { id: 'registered-a', ...snapshotDeck(saved, [{ id: 'side', name: '当時のサイド' }]) };
  const event = { ...eventFixture(), deckCount: '2', decks: [deck, { id: 'registered-b', deckName: '構築B', cards: [] }] };
  event.matches[0].games = [{ ...createGameRecord(), ...snapshotDeck(saved, deck.sideDeckSettings), result: 'loss', opponent: '相手A', turn: 'first', memo: '初手を記録' }, { ...createGameRecord(), deckName: '構築B', result: 'win', turn: 'second' }];
  putEvent('old', event); await flushLibrary();
  saved.cards[0].count = 9; event.matches[0].games[0].cards[0].count = 9;
  const expected = structuredClone(getEvents('old'));
  assert.equal(expected[0].decks[0].cards[0].count, 2);
  assert.equal(expected[0].matches[0].games[0].cards[0].count, 2);
  db.close(); db = await openLibrary(factory); await initializeLibrary(db);
  assert.deepEqual(getEvents('old'), expected);
  await restoreLibrary(await exportLibrary(() => { throw new Error('No images expected'); }));
  const restored = snapshotLibrary().games.find(game => game.name === '以前のゲーム（復元）');
  assert.deepEqual(getEvents(restored.gameId), expected);
  const old = eventFixture(); delete old.deckCount; delete old.decks;
  old.format = '2デッキ制'; old.matches.forEach(match => { delete match.games; });
  const normalized = validateEvents([old])[0];
  assert.equal(normalized.format, '2デッキ制'); assert.equal(normalized.deckCount, '');
  assert.equal(normalized.matches[0].score, '2-1');
  assert.deepEqual(normalized.matches[0].games, []);
  for (const change of [
    value => { value.deckCount = '-2'; },
    value => { value.decks = null; },
    value => { value.decks.push(value.decks[0]); },
    value => { value.matches[0].games = {}; },
    value => { value.matches[0].games.push(value.matches[0].games[0]); },
    value => { value.matches[0].games[0].result = 'bad'; },
    value => { value.matches[0].games[0].cards[0].count = -1; },
    value => { value.matches[0].games[0].sideDecks.side[0].count = -1; },
  ]) {
    const invalid = structuredClone(expected[0]); change(invalid);
    assert.throws(() => validateEvents([invalid]));
  }
  db.close();
});

test('戦績・順位・構築を再接続と画像込みバックアップで復元し、同名イベント・別ゲームを分離する', async () => {
  const factory = new IDBFactory(); let db = await openLibrary(factory);
  await db.write(legacy()); await initializeLibrary(db);
  const gameId = createGame('戦績保存の検証');
  const first = eventFixture(), second = { ...eventFixture(), at: '', finalRank: '' };
  putEvent(gameId, first); putEvent(gameId, second);
  first.matches[0].cards[0].count = 99;
  assert.equal(getEvents(gameId)[0].matches[0].cards[0].count, 2);
  await flushLibrary(); const expected = structuredClone(getEvents(gameId));
  db.close(); db = await openLibrary(factory); await initializeLibrary(db);
  assert.deepEqual(getEvents(gameId), expected);
  assert.equal(recordText(allRecords(getEvents(gameId))), '2勝 0敗 0分');
  const backup = await exportLibrary(() => { throw new Error('No images expected'); });
  await restoreLibrary(backup);
  const restored = snapshotLibrary().games.find(game => game.name === '戦績保存の検証（復元）');
  assert.deepEqual(getEvents(restored.gameId), expected);
  switchGame(restored.gameId);
  removeEvent(gameId, first.id); await flushLibrary();
  assert.equal(getEvents(gameId).length, 1);
  assert.deepEqual(getEvents(restored.gameId), expected);
  assert.deepEqual(getEvents('old'), []);
  db.close(); db = await openLibrary(factory); await initializeLibrary(db);
  assert.equal(getEvents(gameId).length, 1);
  assert.deepEqual(getEvents(restored.gameId), expected);
  db.close();
});

test('戦績欄のない以前の保存を空の戦績で読み込み、不正な復元では既存データを変えない', async () => {
  const old = legacy();
  const normalized = validateLibrary(old);
  assert.deepEqual(normalized.games[0].events, []);
  assert.equal(Object.hasOwn(old.games[0], 'events'), false);
  let stored = old;
  await initializeLibrary({ read: async () => stored, write: async value => { stored = structuredClone(value); } });
  const event = eventFixture(); putEvent('old', event); await flushLibrary();
  const before = snapshotLibrary();
  for (const bad of [null, {}, [event, event]]) {
    const broken = structuredClone(before); broken.games[0].events = bad;
    await assert.rejects(restoreLibrary(broken), /戦績/);
    assert.deepEqual(snapshotLibrary(), before);
    const { automation, ...data } = stored;
    assert.ok(automation.revision);
    assert.deepEqual(data, before);
  }
});

test('不正な日時・勝敗・回戦・重複ID・構築を拒否し、任意項目と日時不明を受け付ける', () => {
  const event = eventFixture();
  assert.equal(validateEvents([{ ...createEvent(), at: '' }])[0].at, '');
  for (const change of [
    draft => { draft.at = '2026-02-30T12:00'; },
    draft => { draft.at = '2026-10-08T25:00'; },
    draft => { draft.rounds = '-1'; },
    draft => { draft.matches[0].result = 'unknown-typo'; },
    draft => { draft.matches[0].round = 1.5; },
    draft => { draft.matches[1].id = draft.matches[0].id; },
    draft => { draft.matches[0].cards[0].count = -1; },
    draft => { draft.matches[0].cards.push(draft.matches[0].cards[0]); },
    draft => { draft.matches[0].memo = {}; },
  ]) {
    const broken = structuredClone(event); change(broken);
    assert.throws(() => validateEvents([broken]), /戦績/);
  }
  assert.equal(validateEvents([{ ...event, at: '2024-02-29' }])[0].at, '2024-02-29');
});

test('保存失敗を通知し、入力したイベントを同じIDで再試行できる', async () => {
  let stored = legacy(), fail = false;
  await initializeLibrary({ read: async () => structuredClone(stored), write: async value => { if (fail) throw new Error('quota'); stored = structuredClone(value); } });
  const event = eventFixture();
  fail = true; putEvent('old', event);
  await assert.rejects(flushLibrary(), /quota/);
  assert.equal(stored.games[0].events.length, 0);
  assert.equal(getEvents('old').length, 1);
  fail = false; putEvent('old', event); await flushLibrary();
  assert.equal(stored.games[0].events.length, 1);
  fail = true; removeEvent('old', event.id); await assert.rejects(flushLibrary(), /quota/);
  assert.equal(stored.games[0].events.length, 1);
  fail = false; removeEvent('old', event.id); await flushLibrary();
  assert.equal(stored.games[0].events.length, 0);
});
