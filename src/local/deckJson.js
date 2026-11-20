import { normalizeCardSize } from './cardSize.js';
import { cardEntries, validateSideSettings, validateSideCards } from './sideDecks.js';
import { keysOf } from './cardFields.js';

const configOf = settings => ({ labels: settings.labels, fieldKeys: keysOf(settings), source: settings.source, cardSize: normalizeCardSize(settings.cardSize) });
function cardDataOnly(card) {
  const result = { ...card };
  if (result.generatedArtwork) { result.image = ''; delete result.generatedArtwork; }
  if (result.front) result.front = cardDataOnly(result.front);
  if (result.back) result.back = cardDataOnly(result.back);
  return result;
}
export const makeDeckJson = (deck, settings, cards) => ({
  ...deck,
  cards: deck.cards.map(item => ({ ...cardDataOnly(cards.find(card => card.id === item.id) || item), count: item.count, isDeckThumbnail: !!item.isDeckThumbnail })),
  tokenDeck: cardEntries(deck.tokenDeck).map(item => ({ ...cardDataOnly(cards.find(card => card.id === Number(item.id)) || item), count: item.count })),
  sideDecks: Object.fromEntries(Object.entries(deck.sideDecks || {}).map(([id, items]) => [id, items.map(item => ({ ...cardDataOnly(cards.find(card => card.id === item.id) || item), count: item.count }))])),
  sideDeckSettings: validateSideSettings(settings.sideDecks),
  localFormat: 'tcg-local-deck-v1',
  localSettings: configOf(settings),
});

export function prepareDeckImport(deck, settings, cards) {
  if (!deck || !Array.isArray(deck.cards) || typeof deck.name !== 'string' || !deck.name.trim()) throw new Error('デッキの形式が正しくありません。');
  if (deck.localFormat && deck.localFormat !== 'tcg-local-deck-v1') throw new Error('この形式のデッキJSONは読み込めません。');
  if (deck.localFormat && JSON.stringify(configOf(deck.localSettings)) !== JSON.stringify(configOf(settings))) throw new Error('項目名・セット名に使うもの・カードサイズを、元のデッキと同じ設定にしてください。');
  const idMap = new Map();
  const resolveCard = item => {
    // 同じカード群でも登録順が異なることがあるため、画像の相対パスを優先する。
    const matches = cards.filter(card => item.mockPath ? card.mockPath === item.mockPath : card.id === Number(item.id));
    if (matches.length !== 1) throw new Error('カードを確認できません。元と同じカードデータを先に読み込んでください。');
    const card = matches[0];
    if (deck.localFormat && !item.mockPath && (item.name !== card.name || String(item.cardNumber || '') !== String(card.cardNumber || ''))) throw new Error('カードを確認できません。元と同じカードデータを先に読み込んでください。');
    if (deck.localFormat && String(item.mockLimit ?? '') !== String(card.mockLimit ?? '')) throw new Error('カードの採用上限を、元のデッキと同じ設定にしてください。');
    const count = Number(item.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('カード枚数は0以上の整数にしてください。');
    idMap.set(Number(item.id), card.id);
    return { ...card, count, isDeckThumbnail: !!item.isDeckThumbnail };
  };
  const imported = deck.cards.map(resolveCard);
  const tokens = cardEntries(deck.tokenDeck).map(resolveCard);
  const targetSides = validateSideSettings(settings.sideDecks);
  const sourceSides = validateSideSettings(deck.sideDeckSettings ?? targetSides);
  validateSideCards(deck.sideDecks, new Set(sourceSides.map(side => side.id)));
  const sideDecks = {};
  for (const [id, items] of Object.entries(deck.sideDecks || {})) {
    if (!items.length) continue;
    const source = sourceSides.find(side => side.id === id);
    const exact = targetSides.find(side => side.id === id);
    const matches = exact ? [exact] : targetSides.filter(side => side.name === source?.name);
    if (matches.length !== 1 || Object.hasOwn(sideDecks, matches[0].id)) throw new Error('サイドデッキの数・表示名を元のゲームと同じ設定にしてください。');
    sideDecks[matches[0].id] = items.map(resolveCard);
  }
  if (new Set(imported.map(c=>c.id)).size !== imported.length || new Set(tokens.map(c=>c.id)).size !== tokens.length) throw new Error('同じカードが複数の行にあります。1行にまとめてください。');
  validateSideCards(sideDecks, new Set(targetSides.map(side => side.id)), new Set(cards.map(card => card.id)));
  return { ...deck, cards: imported, sideDecks, ...(Object.hasOwn(deck, 'tokenDeck') ? { tokenDeck: tokens } : {}), thumbnailCardId: idMap.get(Number(deck.thumbnailCardId)) ?? null };
}
