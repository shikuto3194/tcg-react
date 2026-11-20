import { getDraft, updateDraft, getLocalCards, getLocalSettings, getLocalLimit } from './store.js';
import { sidesOf } from './sideDecks.js';

export function setDraftCount(gameId, zone, id, count) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('枚数は0以上の整数にしてください。');
  const card = getLocalCards().find(card => card.id === id);
  if (!card) throw new Error('カードが見つかりません。');
  if (zone !== 'main' && !getLocalSettings().sideDecks?.some(side => side.id === zone)) throw new Error('サイドデッキが見つかりません。');
  const draft = getDraft(gameId), sides = sidesOf(draft);
  const entries = zone === 'main' ? draft.deck || [] : sides[zone] || [];
  const previous = entries.find(card => card.id === id)?.count || 0;
  // Existing decks over a newly lowered limit may still be reduced.
  if (count > previous && count > getLocalLimit(card)) throw new Error('採用上限を超えています。');
  const next = entries.some(card => card.id === id)
    ? entries.map(card => card.id === id ? { ...card, count } : card).filter(card => card.count > 0)
    : [...entries, ...(count ? [{ id, count }] : [])];
  updateDraft(gameId, zone === 'main' ? { deck: next } : { sideDecks: { ...sides, [zone]: next } });
}
export function changeDraftCount(gameId, zone, id, delta) {
  const draft = getDraft(gameId);
  const entries = zone === 'main' ? draft.deck || [] : sidesOf(draft)[zone] || [];
  const count = entries.find(card => card.id === id)?.count || 0;
  const card = getLocalCards().find(card => card.id === id);
  if (!card || (delta > 0 && count >= getLocalLimit(card))) return;
  setDraftCount(gameId, zone, id, Math.max(0, count + delta));
}
export function clearDraft(gameId) {
  updateDraft(gameId, { deck: [], sideDecks: {}, tokenDeck: [], deckName: '', currentDeckName: '', deckThumbnailCardId: null });
}
