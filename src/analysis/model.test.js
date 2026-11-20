import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRecords, createEvent, createMatch, createGameRecord, dailyResults, eventLabels, filterEvents, filterRecords, groupRecords, nextMatch, recordText, winRate } from './model.js';
import { createGame, putEvent, getEvents as readEvents, removeEvent } from '../local/store.js';

const fixture = (name, matches = []) => ({ ...createEvent(), name, at: '2026-10-08T13:00', matches });
const match = values => ({ ...createMatch(), ...values });

test('2デッキ制とBO形式は独立し、マッチ勝敗と各ゲームの勝敗を混ぜない', () => {
  const event = { ...fixture('2デッキ大会', [match({ result: 'win', games: [
    { ...createGameRecord(), deckName: 'A', opponent: 'X', result: 'loss', turn: 'first' },
    { ...createGameRecord(), deckName: 'B', opponent: 'Y', result: 'win', turn: 'second' },
    { ...createGameRecord(), deckName: 'A', opponent: 'Y', result: 'win', turn: 'second' },
    createGameRecord(),
  ] })]), format: 'BO3', deckCount: '2' };
  assert.equal(recordText(allRecords([event])), '1勝 0敗 0分');
  assert.equal(recordText(allRecords([event], 'game')), '2勝 1敗 0分');
  assert.equal(groupRecords(allRecords([event]), 'deck')[0][0], 'A / B');
  assert.equal(groupRecords(allRecords([event]), 'deck')[0][1].length, 1);
  const reversed = { ...event, matches: [{ ...event.matches[0], games: [...event.matches[0].games].reverse() }] };
  assert.equal(groupRecords(allRecords([event, reversed]), 'deck').length, 1);
  assert.equal(groupRecords(allRecords([event], 'game'), 'deck')[0][1].length, 2);
  assert.equal(filterEvents([event], { deckCount: '2', format: 'BO3' }).length, 1);
  assert.equal(filterEvents([event], { deckCount: '1', format: 'BO3' }).length, 0);
  assert.equal(filterEvents([event], { unit: 'game', deck: 'A', result: 'loss', turn: 'first' })[0].matched.length, 1);
  assert.equal(filterEvents([event], { unit: 'game', deck: 'A', opponent: 'X', turn: 'second' }).length, 0);
  assert.equal(filterEvents([event], { deck: 'A', opponent: 'X', turn: 'second' }).length, 0);
  assert.equal(filterEvents([event], { deck: 'B', opponent: 'Y', result: 'win' })[0].matched.length, 1);
  const before = fixture('以前のBO3', [match({ deckName: 'A', result: 'win', score: '2-1' })]);
  assert.equal(allRecords([before], 'game').length, 0);
  assert.equal(recordText(allRecords([before, event])), '2勝 0敗 0分');
  const unfinished = { ...event, matches: [{ ...event.matches[0], result: '' }] };
  assert.equal(recordText(allRecords([unfinished])), '0勝 0敗 0分');
  assert.equal(recordText(allRecords([unfinished], 'game')), '2勝 1敗 0分');
});

test('同名・同日時のイベントも別の記録として編集・削除でき、別ゲームに混ざらない', () => {
  const game = createGame('イベント分離の検証');
  const first = fixture('店舗大会', [match({ result: 'win' })]);
  const second = fixture('店舗大会', [match({ result: 'loss' })]);
  const independent = fixture('店舗大会', [match({ opponent: '内容不明の相手' })]);
  for (const event of [first, second, independent]) putEvent(game, event);
  assert.equal(readEvents(game).length, 3);
  assert.equal(new Set(eventLabels(readEvents(game)).values()).size, 3);
  assert.equal(filterEvents(readEvents(game), { eventId: first.id })[0].matched.length, 1);
  first.finalRank = '1';
  first.matches[0].result = 'draw';
  putEvent(game, first);
  assert.equal(readEvents(game).find(event => event.id === second.id).matches[0].result, 'loss');
  assert.equal(readEvents(game).find(event => event.id === second.id).finalRank, '');
  removeEvent(game, first.id);
  assert.equal(readEvents(game).length, 2);
  assert.equal(readEvents('unrelated-game').length, 0);
});

test('勝敗不明は集計せず、空欄の回戦は数えずにイベントと入力した対戦を保持する', () => {
  const event = fixture('', [createMatch(), match({ opponent: '相手のみ' }), match({ result: 'win' }), match({ result: 'loss' }), match({ result: 'draw' })]);
  const rows = allRecords([event]);
  assert.equal(rows.length, 4);
  assert.equal(recordText(rows), '1勝 1敗 1分');
  assert.equal(winRate(rows), '50%');
  assert.equal(filterEvents([event], { result: 'unknown' })[0].matched.length, 1);
  assert.equal(winRate(filterRecords(rows, { result: 'unknown' })), '—');
  assert.equal(filterEvents([fixture('順位だけ', [])]).length, 1);
});

test('日付・イベント・形式・デッキ・相手・勝敗・先後を同じ対戦へのAND条件で絞る', () => {
  const event = { ...fixture('店舗大会', [match({ deckName: 'A', opponent: 'X', result: 'loss', turn: 'first' }), match({ deckName: 'B', opponent: 'X', result: 'win', turn: 'second' })]), format: 'BO3' };
  const other = { ...fixture('店舗大会', [match({ deckName: 'B', opponent: 'X', result: 'win', turn: 'second' })]), format: 'BO1' };
  assert.equal(filterEvents([event], { deck: 'A', result: 'win' }).length, 0);
  const filters = { from: '2026-10-08', to: '2026-10-08', eventId: event.id, format: 'BO3', deck: 'B', opponent: 'X', result: 'win', turn: 'second' };
  const selected = filterEvents([event, other], filters);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].matched.length, 1);
  assert.equal(filterEvents([event], { ...filters, to: '2026-10-07' }).length, 0);
  assert.equal(filterEvents([{ ...event, at: '' }], { from: '2026-10-01' }).length, 0);
});

test('指定N回戦の次は決勝Tへ進み、決勝なしでは終了し、回戦数不明なら続けられる', () => {
  const event = { ...createEvent(), rounds: '2', playoff: 'yes' };
  const first = match({ result: 'win', opponent: 'X' });
  const second = nextMatch(event, first);
  assert.equal(second.round, 2);
  assert.equal(second.stage, 'regular');
  const playoff = nextMatch(event, second);
  assert.equal(playoff.stage, 'playoff');
  assert.equal(playoff.round, 1);
  assert.equal(nextMatch(event, playoff).round, 2);
  assert.equal(nextMatch({ ...event, playoff: 'no' }, second), null);
  assert.equal(nextMatch({ ...event, rounds: '' }, second).round, 3);
  assert.equal(first.result, 'win');
  assert.equal(first.opponent, 'X');
});

test('項目別集計は不明を除外し、イベント別集計は名前では結合しない', () => {
  const rows = allRecords([
    fixture('同名', [match({ result: 'win', opponent: 'X', deckName: 'A' }), match({ result: 'loss' })]),
    fixture('同名', [match({ result: 'win', opponent: 'X' }), match({ opponent: 'X' })]),
    fixture('', [match({ result: 'win' })]),
  ]);
  assert.equal(groupRecords(rows, 'event').length, 2);
  assert.equal(groupRecords(rows, 'opponent')[0][1].length, 2);
  assert.equal(groupRecords(rows, 'deck')[0][1].length, 1);
  assert.equal(groupRecords(rows, 'turn').length, 0);
});

test('日時不明は期間集計に含めず、累計では分かっている勝敗を数える', () => {
  const rows = allRecords([{ ...fixture('', [match({ result: 'win' })]), at: '' }, { ...fixture('', [match({ result: 'loss' })]), at: '2026-08-01T12:00' }, fixture('', [match({ result: 'draw' })])]);
  assert.equal(recordText(rows), '1勝 1敗 1分');
  assert.equal(recordText(filterRecords(rows, { from: '2026-09-09', to: '2026-10-08' })), '0勝 0敗 1分');
});

test('日別集計は30日より前も含め、同日の記録をまとめ、未対戦日や不明を0勝率にしない', () => {
  const rows = [
    { at: '2026-08-05T15:00', result: 'loss' }, { at: '2025-12-30', result: 'win' },
    { at: '2026-08-05T10:00', result: 'win' }, { at: '2026-08-05', result: 'draw' },
    { at: '2026-08-06', result: 'draw' }, { at: '2026-08-07', result: '' }, { at: '', result: 'win' },
  ];
  assert.deepEqual(dailyResults(rows), [
    { day: '2025-12-30', win: 1, loss: 0, draw: 0 },
    { day: '2026-08-05', win: 1, loss: 1, draw: 1 },
    { day: '2026-08-06', win: 0, loss: 0, draw: 1 },
  ]);
  assert.deepEqual(dailyResults(rows, { from: '2026-08-05', to: '2026-08-05' }), [{ day: '2026-08-05', win: 1, loss: 1, draw: 1 }]);
  assert.deepEqual(dailyResults(rows, { from: '2026-08-06' }), [{ day: '2026-08-06', win: 0, loss: 0, draw: 1 }]);
  assert.deepEqual(dailyResults(rows, { to: '2026-01-01' }), [{ day: '2025-12-30', win: 1, loss: 0, draw: 0 }]);
  assert.deepEqual(dailyResults(rows, { from: '2026-08-06', to: '2026-08-05' }), []);
  assert.deepEqual(dailyResults(rows, { from: '2026-07-01', to: '2026-07-31' }), []);
});
