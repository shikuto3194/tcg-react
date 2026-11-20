import { allDeckCards, minimalCards, sidesOf } from './sideDecks.js';
import { withDeckSaveTimes } from '../utils/savedDeckSort.js';

export function draftForDeck(deck) {
  const cards = allDeckCards(deck);
  return { deck: minimalCards(deck.cards || []), sideDecks: sidesOf(deck), tokenDeck: [], deckName: deck.name, currentDeckName: deck.name,
    deckThumbnailCardId: deck.thumbnailCardId ?? cards.find(card => card.isDeckThumbnail)?.id ?? cards[0]?.id ?? null };
}
export function prepareDraftSave(draft, savedDecks) {
  if (!draft.deckName?.trim()) throw new Error('デッキ名を入力してください。');
  const existing = savedDecks.find(deck => deck.name === draft.deckName);
  const cards = minimalCards(draft.deck || []), sides = Object.fromEntries(Object.entries(sidesOf(draft)).map(([id, entries]) => [id, minimalCards(entries)]));
  const all = [...cards, ...Object.values(sides).flat()];
  const thumbnailCardId = all.some(card => card.id === draft.deckThumbnailCardId) ? draft.deckThumbnailCardId : all.find(card => card.isDeckThumbnail)?.id ?? all[0]?.id ?? null;
  const deck = withDeckSaveTimes({ ...existing, id: existing?.id || crypto.randomUUID(), name: draft.deckName, cards, sideDecks: sides, tokenDeck: [], thumbnailCardId }, existing);
  return { deck, overwrite: !!existing, decks: existing ? savedDecks.map(row => row === existing ? deck : row) : [...savedDecks, deck] };
}
