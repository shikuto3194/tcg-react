import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeOperation } from './operations.js';
import { initializeLibrary, snapshotLibrary, getLibraryRevision, getLocalCards, getDraft, updateDraft, flushLibrary, restoreLibrary, getSavedDecks } from '../local/store.js';
import { operations } from './catalog.js';
const base = () => ({ format: 'tcg-local-library-v1', activeGameId: 'test', games: [{ gameId: 'test', name: '検証', settings: { labels: [], source: 'folder', sideDecks: [{ id: 'side', name: 'サイド' }] }, cards: [{ id: 1, name: 'A', image: '', mockLimit: '3' }], storage: {} }] });
const request = args => ({ gameId: 'test', requestId: crypto.randomUUID(), expectedRevision: getLibraryRevision(), ...args });
async function setup() {
  let saved = base(), failing = false;
  const adapter = { read: async () => structuredClone(saved), write: async value => { if (failing) throw new Error('容量不足'); saved = structuredClone(value); } };
  await initializeLibrary(adapter);
  return { adapter, fail: value => { failing = value; }, saved: () => saved };
}

test('検索は設定済みの安定キーだけを受け付け、改名・追加・削除後も条件を落とさない', async () => {
  const data = base();
  data.games[0].settings.labels = ['色', '種類'];
  await initializeLibrary({ read: async () => structuredClone(data), write: async () => {} });
  assert.deepEqual((await executeOperation('tcg_settings_get', { gameId: 'test' })).data.fieldKeys, ['color', 'type']);
  data.games[0].settings.labels = ['色', '追加項目'];
  data.games[0].settings.fieldKeys = ['color', 'item8'];
  data.games[0].cards = [
    { id: 1, name: '赤', color: ['赤'], item8: '甲', image: '' },
    { id: 2, name: '青', color: ['青'], item8: '甲', image: '' },
    { id: 3, name: '赤2', color: ['赤'], item8: '乙', image: '' },
    { id: 4, name: '赤青', color: ['赤', '青'], item8: '乙', image: '' },
  ];
  await initializeLibrary({ read: async () => structuredClone(data), write: async () => {} });
  assert.deepEqual((await executeOperation('tcg_settings_get', { gameId: 'test' })).data.fieldKeys, ['color', 'item8']);
  const search = fields => executeOperation('tcg_cards_search', { gameId: 'test', fields });
  assert.deepEqual((await search({ color: '赤' })).data.cards.map(card => card.id), [1, 3]);
  assert.deepEqual((await search({ color: '赤', item8: '甲' })).data.cards.map(card => card.id), [1]);
  for (const fields of [{ item1: '赤' }, { color: '赤', unknown: '' }, { type: '旧項目' }, { item9: '未追加' }]) {
    await assert.rejects(search(fields), error => error.code === 'INVALID_SEARCH_FIELD' && error.message.includes('color（色）') && error.message.includes('item8（追加項目）'));
  }
  const before = snapshotLibrary();
  await assert.rejects(search({ 色: '赤' }), { code: 'INVALID_SEARCH_FIELD' });
  assert.deepEqual(snapshotLibrary(), before);
});

test('AIの不足検索と集計は保存済みの0を含み、未入力への変更後は除外する', async () => {
  const env = await setup();
  await executeOperation('tcg_draft_set_count', request({ cardId: 1, zoneId: 'main', count: 2 }));
  await executeOperation('tcg_draft_set_count', request({ cardId: 1, zoneId: 'side', count: 3 }));
  await executeOperation('tcg_draft_configure', request({ name: '不足確認' }));
  await executeOperation('tcg_draft_save', request({}));
  const query = { gameId: 'test' };
  for (const count of [0, null]) {
    const result = await executeOperation('tcg_ownership_set', request({ counts: [{ cardId: 1, count }] }));
    assert.equal(result.status, 'saved');
    await initializeLibrary(env.adapter);
    const ownership = (await executeOperation('tcg_ownership_get', query)).data;
    assert.deepEqual(ownership.shortages.map(({ id, usedCount, shortage }) => ({ id, usedCount, shortage })), count === 0 ? [{ id: 1, usedCount: 5, shortage: 5 }] : []);
    const search = (await executeOperation('tcg_cards_search', { ...query, ownership: 'shortage' })).data;
    assert.deepEqual(search.cards.map(card => card.id), count === 0 ? [1] : []);
  }
});

test('AIのゲーム削除は公開せず、名前を直接指定しても保存データを変えない', async () => {
  const env = await setup(), before = snapshotLibrary();
  assert.equal(operations.some(row => row.key === 'game_delete'), false);
  await assert.rejects(executeOperation('tcg_game_delete', request({ confirm: true })), { code: 'UNKNOWN_OPERATION' });
  assert.deepEqual(snapshotLibrary(), before);
  await flushLibrary();
  await initializeLibrary(env.adapter);
  assert.deepEqual(snapshotLibrary(), before);
});
test('再送は再起動後も二重実行しない。操作IDの使い回しと人間の途中変更を拒否', async () => {
  const env = await setup();
  const input = request({ card: { name: '追加' } });
  const result = await executeOperation('tcg_cards_add', input);
  await initializeLibrary(env.adapter);
  assert.deepEqual(await executeOperation('tcg_cards_add', input), result);
  assert.equal(getLocalCards().length, 2);
  await assert.rejects(executeOperation('tcg_cards_add', { ...input, card: { name: '別内容' } }), { code: 'REQUEST_ID_REUSED' });
  const stale = request({ cardId: 1, zoneId: 'main', count: 2 });
  updateDraft('test', { deckName: '人間の変更' });
  await assert.rejects(executeOperation('tcg_draft_set_count', stale), { code: 'CONFLICT' });
  assert.equal(getDraft().deckName, '人間の変更');
});
test('保存エラーと一括入力エラーで元へ戻り、同じ操作を再試行できる', async () => {
  const env = await setup(), before = snapshotLibrary();
  const input = request({ card: { name: '追加' } });
  env.fail(true); await assert.rejects(executeOperation('tcg_cards_add', input), /容量不足/);
  assert.deepEqual(snapshotLibrary(), before);
  env.fail(false); await flushLibrary().catch(() => {});
  await executeOperation('tcg_cards_add', input);
  assert.equal(getLocalCards().length, 2);
  const prior = snapshotLibrary();
  await assert.rejects(executeOperation('tcg_ownership_set', request({ counts: [{ cardId: 1, count: 4 }, { cardId: 999, count: 2 }] })), { code: 'NOT_FOUND' });
  assert.deepEqual(snapshotLibrary(), prior);
});
test('メインとサイドの独立した上限・保存・固定ID・上書き・出力用の構築を維持', async () => {
  await setup();
  for (const zoneId of ['main', 'side']) await executeOperation('tcg_draft_set_count', request({ cardId: 1, zoneId, count: 3 }));
  await assert.rejects(executeOperation('tcg_draft_set_count', request({ cardId: 1, zoneId: 'main', count: 4 })), /採用上限/);
  await executeOperation('tcg_draft_configure', request({ name: '共通デッキ' }));
  const result = await executeOperation('tcg_draft_save', request({}));
  const deck = (await executeOperation('tcg_decks_get', { gameId: 'test', deckId: result.data.deckId })).data;
  assert.equal(deck.cards[0].count, 3); assert.equal(deck.sideDecks.side[0].count, 3);
  await executeOperation('tcg_draft_load', request({ deckId: deck.id }));
  await assert.rejects(executeOperation('tcg_draft_save', request({})), { code: 'CONFIRMATION_REQUIRED' });
  const overwritten = await executeOperation('tcg_draft_save', request({ overwrite: true }));
  assert.equal(overwritten.data.deckId, deck.id);
});
test('未知の引数・別ゲーム・上書き未確認を拒否し、接続情報をバックアップへ含めない', async () => {
  await setup();
  await assert.rejects(executeOperation('tcg_draft_clear', request({ arbitraryCode: 'run' })), { code: 'INVALID_INPUT' });
  await assert.rejects(executeOperation('tcg_cards_search', { gameId: 'different' }), { code: 'GAME_MISMATCH' });
  assert.equal(Object.hasOwn(snapshotLibrary(), 'automation'), false);
});
test('ゲーム作成の再送は画面が別ゲームへ切り替わっても再実行しない', async () => {
  await setup();
  const input = request({ name: '新ゲーム' });
  const result = await executeOperation('tcg_game_create', input);
  assert.deepEqual(await executeOperation('tcg_game_create', input), result);
  assert.equal(snapshotLibrary().games.length, 2);
});
test('以前の保存デッキに安定IDを付与し、旧バックアップ復元直後もAIで取得できる', async () => {
  const old = base();
  old.games[0].storage.savedCanvasDecks = JSON.stringify([{ name: '旧形式', cards: [{ id: 1, count: 2 }] }]);
  let saved = old;
  const adapter = { read: async () => structuredClone(saved), write: async value => { saved = structuredClone(value); } };
  await initializeLibrary(adapter);
  const id = getSavedDecks()[0].id;
  assert.equal(typeof id, 'string');
  await initializeLibrary(adapter);
  assert.equal(getSavedDecks()[0].id, id);
  await restoreLibrary(old);
  const restored = getSavedDecks()[0], gameId = snapshotLibrary().activeGameId;
  assert.notEqual(restored.id, id);
  assert.deepEqual((await executeOperation('tcg_decks_get', { gameId, deckId: restored.id })).data.cards, [{ id: 1, count: 2 }]);
  assert.equal(getLocalCards()[0].id, 1);
});
test('戦績には保存時の構築を残し、共通条件の集計と削除を行う', async () => {
  await setup();
  await executeOperation('tcg_draft_set_count', request({ cardId: 1, zoneId: 'main', count: 2 }));
  await executeOperation('tcg_draft_configure', request({ name: '対戦デッキ' }));
  const deckId = (await executeOperation('tcg_draft_save', request({}))).data.deckId;
  const eventId = (await executeOperation('tcg_events_put', request({ event: { name: '大会', at: '2026-10-10', matches: [{ deckId, result: 'win', turn: 'first' }, { result: 'draw', turn: 'second' }] } }))).data.eventId;
  await executeOperation('tcg_draft_set_count', request({ cardId: 1, zoneId: 'main', count: 3 }));
  const events = (await executeOperation('tcg_events_list', { gameId: 'test' })).data;
  assert.equal(events[0].matches[0].cards[0].count, 2);
  const stats = (await executeOperation('tcg_statistics_get', { gameId: 'test', filters: { turn: 'first' } })).data;
  assert.deepEqual(stats.totals, { win: 1, loss: 0, draw: 0 });
  assert.equal(stats.winRate, '100%');
  await executeOperation('tcg_events_delete', request({ eventId, confirm: true }));
  assert.deepEqual((await executeOperation('tcg_events_list', { gameId: 'test' })).data, []);
});

test('AIも登録デッキと各ゲームの構築を保存し、マッチ・ゲーム単位を明示して取得する', async () => {
  await setup();
  await executeOperation('tcg_draft_set_count', request({ cardId: 1, zoneId: 'main', count: 2 }));
  await executeOperation('tcg_draft_set_count', request({ cardId: 1, zoneId: 'side', count: 1 }));
  await executeOperation('tcg_draft_configure', request({ name: 'A' }));
  const a = (await executeOperation('tcg_draft_save', request({}))).data.deckId;
  await executeOperation('tcg_draft_configure', request({ name: 'B' }));
  const b = (await executeOperation('tcg_draft_save', request({}))).data.deckId;
  const input = request({ event: { name: '2デッキ制', format: 'BO3', deckCount: '2', decks: [{ id: 'a', deckId: a }, { id: 'b', deckId: b }], matches: [{ result: 'win', games: [
    { registeredDeckId: 'a', opponent: 'X', result: 'loss', turn: 'first' },
    { registeredDeckId: 'b', opponent: 'Y', result: 'win', turn: 'second' },
    { registeredDeckId: 'a', opponent: 'Y', result: 'win', turn: 'second' },
  ] }] } });
  const response = await executeOperation('tcg_events_put', input);
  assert.deepEqual(await executeOperation('tcg_events_put', input), response);
  let event = (await executeOperation('tcg_events_list', { gameId: 'test' })).data[0];
  const expected = structuredClone(event);
  assert.equal(event.decks.length, 2); assert.equal(event.matches[0].games.length, 3);
  assert.equal(event.matches[0].games[0].sideDecks.side[0].count, 1);
  const stats = unit => executeOperation('tcg_statistics_get', { gameId: 'test', unit, group: 'deck' });
  assert.deepEqual((await stats('match')).data.totals, { win: 1, loss: 0, draw: 0 });
  assert.deepEqual((await stats('game')).data.totals, { win: 2, loss: 1, draw: 0 });
  assert.equal((await stats('match')).data.groups[0][0], 'A / B');
  assert.equal((await stats('game')).data.groups.length, 2);
  await executeOperation('tcg_draft_load', request({ deckId: a }));
  await executeOperation('tcg_draft_set_count', request({ cardId: 1, zoneId: 'main', count: 3 }));
  await executeOperation('tcg_draft_save', request({ overwrite: true }));
  // Re-saving the event returned by the AI API must retain historical counts and IDs.
  await executeOperation('tcg_events_put', request({ event }));
  event = (await executeOperation('tcg_events_list', { gameId: 'test' })).data[0];
  assert.deepEqual(event, expected);
  await assert.rejects(executeOperation('tcg_events_put', request({ event: { ...event, matches: [{ games: [{ registeredDeckId: 'missing' }] }] } })), { code: 'NOT_FOUND' });
  await assert.rejects(executeOperation('tcg_events_put', request({ event: { ...event, matches: [{ games: null }] } })), { code: 'INVALID_INPUT' });
  assert.deepEqual((await executeOperation('tcg_events_list', { gameId: 'test' })).data[0], expected);
});
