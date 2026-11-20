import { LEGACY_SIDE_ID, cardEntries, validateSideSettings, validateSideCards, nextSideColor } from './sideDecks.js';
import { normalizeCardSize } from './cardSize.js';
import { validateArtwork } from './cardArtwork.js';
import { validateEvents } from '../analysis/validation.js';
import { validateFields } from './cardFields.js';
import { validateOwned } from './ownership.js';
import { validateLimit } from './cardLimits.js';

export const LIBRARY_FORMAT = 'tcg-local-library-v1';
const plain = x => x && typeof x === 'object' && !Array.isArray(x);
const fail = () => { throw new Error('保存データの形式・画像・カード情報を確認してください。データは変更していません。'); };
export function validateLibrary(input) {
  if (!plain(input) || input.format !== LIBRARY_FORMAT || !Array.isArray(input.games) || !input.games.length) fail();
  const value = structuredClone(input), ids = new Set();
  value.viewMode ??= 'grid';
  if (!['list', 'grid'].includes(value.viewMode)) fail();
  for (const game of value.games) {
    if (!plain(game) || typeof game.gameId !== 'string' || ids.has(game.gameId) || typeof game.name !== 'string' || !game.name.trim() || !Array.isArray(game.cards) || !plain(game.settings)) fail();
    ids.add(game.gameId);
    game.events = validateEvents(Object.hasOwn(game, 'events') ? game.events : []);
    const settings = game.settings;
    validateFields(settings);
    settings.cardSize = normalizeCardSize(settings.cardSize);
    settings.sideDecks = validateSideSettings(settings.sideDecks);
    const cardIds = new Set();
    for (const card of game.cards) {
      if (!plain(card) || !Number.isSafeInteger(card.id) || card.id <= 0 || cardIds.has(card.id)) fail();
      cardIds.add(card.id);
      for (const key of ['mockPath','mockFolder']) if (card[key] != null && typeof card[key] !== 'string') fail();
      validateLimit(card.mockLimit);
      validateOwned(card.ownedCount);
      for (const face of card.isDoubleSided ? [card.front,card.back] : [card]) {
        if (!plain(face) || typeof face.name !== 'string' || !face.name.trim() || typeof face.image !== 'string') fail();
        if (face.image !== '' && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(face.image) && !/^images\/[\w\-./]+\.(?:png|webp)(?:\?v=[\da-f]+)?$/.test(face.image)) fail();
        if (face.image.includes('..')) fail();
        for (const key of ['effect','cardNumber','pack','type','tribe','rarity']) if (face[key] != null && typeof face[key] !== 'string') fail();
        for (const key of ['cost',...Object.keys(face).filter(key=>/^item\d+$/.test(key))]) if (face[key] != null && !['string','number'].includes(typeof face[key])) fail();
        for (const key of ['color','reduction','symbol']) if (face[key] != null && (!Array.isArray(face[key]) || face[key].some(x=>typeof x !== 'string'))) fail();
        validateArtwork(face, { ...settings, gameName: game.name });
      }
    }
    if (!plain(game.storage)) fail();
    for (const [key,text] of Object.entries(game.storage)) {
      if (!['draft','savedCanvasDecks'].includes(key) || typeof text !== 'string') fail();
      let data;
      try { data = JSON.parse(text); } catch { fail(); }
      const decks = key === 'draft' ? [{...data,cards:data.deck || []}] : data;
      if (!Array.isArray(decks)) fail();
      const deckIds = new Set();
      for (const deck of decks) {
        if (!plain(deck) || !Array.isArray(deck.cards)) fail();
        if (deck.id != null) {
          if (typeof deck.id !== 'string' || !deck.id || deck.id.length > 128 || deckIds.has(deck.id)) fail();
          deckIds.add(deck.id);
        }
        for (const key of ['name','deckName','currentDeckName']) if (deck[key] != null && typeof deck[key] !== 'string') fail();
        const seen = new Set();
        for (const item of deck.cards) {
          if (!cardIds.has(item.id) || seen.has(item.id) || !Number.isSafeInteger(item.count) || item.count < 0) fail();
          seen.add(item.id);
        }
        if (cardEntries(deck.tokenDeck).some(card => card.count > 0) && !settings.sideDecks.some(side => side.id === LEGACY_SIDE_ID)) settings.sideDecks.push({ id: LEGACY_SIDE_ID, name: 'トークン', color: nextSideColor(settings.sideDecks) });
        validateSideCards(deck.sideDecks, new Set(settings.sideDecks.map(side => side.id)), cardIds);
        const tokens = cardEntries(deck.tokenDeck);
        for (const item of tokens) if (!cardIds.has(Number(item.id)) || !Number.isSafeInteger(item.count) || item.count < 0) fail();
      }
    }
  }
  if (!ids.has(value.activeGameId)) fail();
  return value;
}

export async function embedBackupImages(snapshot, load) {
  const result = validateLibrary(snapshot), cache = new Map();
  for (const game of result.games) for (const card of game.cards) for (const face of card.isDoubleSided ? [card.front,card.back] : [card]) {
    if (face.image && !face.image.startsWith('data:')) {
      if (!cache.has(face.image)) cache.set(face.image, await load(face.image));
      face.image = cache.get(face.image);
    }
  }
  return validateLibrary(result);
}
