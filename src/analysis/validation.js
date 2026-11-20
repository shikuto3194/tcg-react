import { validateSideCards, validateSideSettings } from '../local/sideDecks.js';
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = () => { throw new Error('戦績の形式を確認してください。イベント・対戦のID、日時、回戦数、勝敗、構築に不正な値があります。'); };
const text = value => { if (typeof value !== 'string') fail(); return value.trim(); };
const oneOf = (value, options) => { if (!options.includes(value)) fail(); return value; };
const positive = value => Number.isSafeInteger(value) && value > 0;
function snapshot(input) {
  if (!plain(input) || !Array.isArray(input.cards)) fail();
  const cardIds = new Set();
  const sideDeckSettings = validateSideSettings(input.sideDeckSettings);
  const sideDecks = validateSideCards(input.sideDecks, new Set(sideDeckSettings.map(side => side.id)));
  return {
    deckName: text(input.deckName),
    ...(input.sideDecks ? { sideDeckSettings, sideDecks: Object.fromEntries(Object.entries(sideDecks).map(([id, cards]) => [id, cards.map(({ id, count }) => ({ id, count }))])) } : {}),
    cards: input.cards.map(card => {
      if (!plain(card) || !positive(card.id) || cardIds.has(card.id) || !Number.isSafeInteger(card.count) || card.count < 0) fail();
      cardIds.add(card.id);
      return { id: card.id, count: card.count };
    }),
  };
}
function resultDetails(input) {
  return { ...snapshot(input), opponent: text(input.opponent), result: oneOf(input.result, ['', 'win', 'loss', 'draw']), turn: oneOf(input.turn, ['', 'first', 'second']), memo: text(input.memo) };
}
function dateTime(value) {
  if (value === '') return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(value)) fail();
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) fail();
  return value;
}

// IDs belong to a game. Restoring as a new game preserves event membership.
// Historical card IDs may be absent from today's library; retain their counts.
export function validateEvents(input) {
  if (!Array.isArray(input)) fail();
  const eventIds = new Set(), matchIds = new Set(), gameIds = new Set();
  return input.map(event => {
    if (!plain(event)) fail();
    const id = text(event.id);
    if (!id || eventIds.has(id) || !Array.isArray(event.matches)) fail();
    eventIds.add(id);
    const rounds = text(event.rounds);
    if (rounds && (!/^\d+$/.test(rounds) || !positive(Number(rounds)))) fail();
    const deckCount = Object.hasOwn(event, 'deckCount') ? text(event.deckCount) : '';
    if (deckCount && (!/^\d+$/.test(deckCount) || !positive(Number(deckCount)))) fail();
    const decks = Object.hasOwn(event, 'decks') ? event.decks : [];
    if (!Array.isArray(decks)) fail();
    const deckIds = new Set(), deckNames = new Set();
    return {
      id, name: text(event.name), at: dateTime(event.at), rounds,
      playoff: oneOf(event.playoff, ['', 'yes', 'no']), format: text(event.format),
      deckCount, decks: decks.map(deck => {
        if (!plain(deck)) fail();
        const id = text(deck.id), saved = snapshot(deck);
        if (!id || deckIds.has(id) || !saved.deckName || deckNames.has(saved.deckName)) fail();
        deckIds.add(id); deckNames.add(saved.deckName);
        return { id, ...saved };
      }),
      qualifyingRank: text(event.qualifyingRank), finalRank: text(event.finalRank),
      matches: event.matches.map(match => {
        if (!plain(match)) fail();
        const id = text(match.id);
        if (!id || matchIds.has(id) || !positive(match.round) || !Array.isArray(match.cards)) fail();
        matchIds.add(id);
        const games = Object.hasOwn(match, 'games') ? match.games : [];
        if (!Array.isArray(games)) fail();
        return {
          id, stage: oneOf(match.stage, ['', 'regular', 'playoff']), round: match.round,
          label: text(match.label), score: text(match.score), ...resultDetails(match),
          games: games.map(game => {
            if (!plain(game)) fail();
            const id = text(game.id);
            if (!id || gameIds.has(id)) fail();
            gameIds.add(id);
            return { id, ...resultDetails(game) };
          }),
        };
      }),
    };
  });
}
