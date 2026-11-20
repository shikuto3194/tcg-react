import { sidesOf } from '../local/sideDecks.js';

export const resultNames = { win: '勝ち', loss: '負け', draw: '引き分け' };
export const turnNames = { '': '不明', first: '先攻', second: '後攻' };
export const localDateTime = (date = new Date()) => {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
export const daysAgo = (days = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateTime(date).slice(0, 10);
};
export const formatDateTime = value => value ? value.replaceAll('-', '/').replace('T', ' ') : '不明';
export const rankText = value => value ? /^\d+$/.test(value) ? `${value}位` : value : '不明';
export const summarize = rows => rows.reduce((sum, row) => {
  if (Object.hasOwn(resultNames, row.result)) sum[row.result]++;
  return sum;
}, { win: 0, loss: 0, draw: 0 });
export const recordText = rows => {
  const { win, loss, draw } = summarize(rows);
  return `${win}勝 ${loss}敗 ${draw}分`;
};
export const winRate = rows => {
  const { win, loss } = summarize(rows);
  return win + loss ? `${Math.round(win / (win + loss) * 100)}%` : '—';
};
export const createEvent = () => ({ id: crypto.randomUUID(), name: '', at: localDateTime(), rounds: '', playoff: '', format: '', deckCount: '', decks: [], qualifyingRank: '', finalRank: '', matches: [] });
export const createGameRecord = () => ({ id: crypto.randomUUID(), deckName: '', opponent: '', result: '', turn: '', memo: '', cards: [] });
export const createMatch = (stage = 'regular', round = 1) => ({ ...createGameRecord(), stage, round, label: '', score: '', games: [] });
export const snapshotDeck = (deck, sideDeckSettings = []) => ({ deckName: deck?.name || '', cards: structuredClone(deck?.cards || []), sideDecks: structuredClone(sidesOf(deck || {})), sideDeckSettings: structuredClone(sideDeckSettings) });
export const matchTitle = match => `${match.label || (match.stage ? `${match.stage === 'playoff' ? '決勝T ' : ''}${match.round}回戦` : `対戦${match.round}`)}${match.gameNumber ? ` · 第${match.gameNumber}ゲーム` : ''}`;
// Navigation may visit empty rounds. Only entered information becomes a match in totals.
export const hasGameDetails = game => ['deckName', 'opponent', 'result', 'turn', 'memo'].some(key => Boolean(game[key]?.trim()));
export const hasMatchDetails = match => hasGameDetails(match) || ['score', 'label'].some(key => Boolean(match[key]?.trim())) || (match.games || []).some(hasGameDetails);
export const recordNames = (row, key) => {
  const games = (row.games || []).filter(hasGameDetails);
  return [...new Set((games.length ? games : [row]).map(record => record[key]).filter(Boolean))];
};
export const recordName = (row, key) => recordNames(row, key).join(' / ');
export function nextMatch(event, current) {
  if (current.stage === 'regular' && event.rounds && current.round >= Number(event.rounds)) {
    return event.playoff === 'yes' ? createMatch('playoff', 1) : null;
  }
  return createMatch(current.stage, current.round + 1);
}
export const eventRecords = (event, unit = 'match') => event.matches.flatMap(match => {
  const context = { at: event.at, eventId: event.id, eventName: event.name };
  if (unit === 'game') return (match.games || []).flatMap((game, index) => hasGameDetails(game) ? [{ ...game, ...context, matchId: match.id, stage: match.stage, round: match.round, label: match.label, gameNumber: index + 1 }] : []);
  return hasMatchDetails(match) ? [{ ...match, ...context }] : [];
});
export const allRecords = (events, unit = 'match') => events.flatMap(event => eventRecords(event, unit));

function matchesDetails(row, { deck, opponent, turn }) {
  return (!deck || row.deckName === deck) && (!opponent || row.opponent === opponent) && (!turn || (turn === 'unknown' ? !row.turn : row.turn === turn));
}
export function filterRecords(rows, { from = '', to = '', deck = '', opponent = '', result = '', turn = '', eventId = '' } = {}) {
  return rows.filter(row => {
    const games = (row.games || []).filter(hasGameDetails);
    return (!from || (row.at && row.at.slice(0, 10) >= from)) && (!to || (row.at && row.at.slice(0, 10) <= to)) && (!result || (result === 'unknown' ? !row.result : row.result === result)) && (!eventId || row.eventId === eventId) && (games.length ? games : [row]).some(record => matchesDetails(record, { deck, opponent, turn }));
  });
}
export function filterEvents(events, filters = {}) {
  const { from = '', to = '', eventId = '', format = '', deckCount = '', deck = '', opponent = '', result = '', turn = '', unit = 'match' } = filters;
  return events.filter(event => (!eventId || event.id === eventId) && (!from || (event.at && event.at.slice(0, 10) >= from)) && (!to || (event.at && event.at.slice(0, 10) <= to)) && (!format || event.format === format) && (!deckCount || event.deckCount === deckCount)).map(event => ({ ...event, matched: filterRecords(eventRecords(event, unit), { deck, opponent, result, turn }) })).filter(event => !(deck || opponent || result || turn) || event.matched.length);
}
export function groupRecords(rows, group) {
  const groups = new Map();
  for (const row of rows) {
    if (!Object.hasOwn(resultNames, row.result)) continue;
    const turns = recordNames(row, 'turn').sort();
    const value = group === 'event' ? row.eventName : group === 'deck' ? recordNames(row, 'deckName').sort().join(' / ') : group === 'turn' ? turns.map(turn => turnNames[turn]).join(' / ') : recordNames(row, 'opponent').sort().join(' / ');
    if (!value) continue;
    const key = group === 'event' ? row.eventId : value;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}
export function eventLabels(events) {
  const labels = new Map();
  const counts = new Map();
  for (const event of events) {
    const base = `${event.name || 'イベント名不明'} · ${formatDateTime(event.at)}`;
    counts.set(base, (counts.get(base) || 0) + 1);
    labels.set(event.id, `${base}${counts.get(base) > 1 ? ` (${counts.get(base)})` : ''}`);
  }
  return labels;
}

export function dailyResults(rows, { from = '', to = '' } = {}) {
  const days = new Map();
  for (const row of filterRecords(rows, { from, to })) {
    if (!row.at || !Object.hasOwn(resultNames, row.result)) continue;
    const day = row.at.slice(0, 10);
    if (!days.has(day)) days.set(day, { day, win: 0, loss: 0, draw: 0 });
    days.get(day)[row.result]++;
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}
