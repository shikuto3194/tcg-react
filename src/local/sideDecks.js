export const LEGACY_SIDE_ID = 'legacy-token';
export function defaultSideColor(index) {
  const palette = ['#b85e00', '#2e7d32', '#7b46a2', '#b53b50', '#007c83', '#6d5944'];
  if (index < palette.length) return palette[index];
  const hue = (index * 137.508) % 360, saturation = 0.65, lightness = 0.34;
  const channel = n => {
    const k = (n + hue / 30) % 12, a = saturation * Math.min(lightness, 1 - lightness);
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
export function nextSideColor(sides) {
  const used = new Set(sides.map((side, index) => side.color || defaultSideColor(index)));
  let index = 0;
  while (used.has(defaultSideColor(index))) index++;
  return defaultSideColor(index);
}
export function nextSideName(sides) {
  const names = new Set(sides.map(side => side.name.trim()));
  let number = 1;
  while (names.has(`サ${number}`)) number++;
  return `サ${number}`;
}
export const cardEntries = value => Array.isArray(value) ? value : Object.entries(value || {}).map(([id, count]) => ({ id: Number(id), count }));
export const minimalCards = cards => cards.filter(card => card.count > 0).map(({ id, count, isDeckThumbnail }) => ({ id, count, ...(isDeckThumbnail ? { isDeckThumbnail: true } : {}) }));
export function sidesOf(deck) {
  const sides = { ...deck.sideDecks };
  const tokens = cardEntries(deck.tokenDeck).filter(card => card.count > 0);
  if (tokens.length && !Object.hasOwn(sides, LEGACY_SIDE_ID)) sides[LEGACY_SIDE_ID] = tokens;
  return sides;
}
export const allDeckCards = deck => [...(deck.cards || deck.deck || []), ...Object.values(sidesOf(deck)).flat()];
export function validateSideSettings(input = []) {
  if (!Array.isArray(input)) throw new Error('サイドデッキの設定を確認してください。');
  const ids = new Set();
  return input.map((side, index) => {
    if (!side || typeof side.id !== 'string' || !/^[\w-]+$/.test(side.id) || ['main', '__proto__', 'constructor', 'prototype'].includes(side.id) || ids.has(side.id) || typeof side.name !== 'string' || !side.name.trim()) throw new Error('サイドデッキの名前とIDを確認してください。');
    ids.add(side.id);
    if (side.color != null && (typeof side.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(side.color))) throw new Error('サイドデッキの色を確認してください。');
    return { id: side.id, name: side.name.trim(), color: side.color || defaultSideColor(index) };
  });
}
export function validateSideCards(sides = {}, allowedIds, cardIds) {
  if (!sides || typeof sides !== 'object' || Array.isArray(sides)) throw new Error('サイドデッキの形式を確認してください。');
  for (const [id, cards] of Object.entries(sides)) {
    if (allowedIds && !allowedIds.has(id)) throw new Error('ゲーム設定にないサイドデッキが含まれています。');
    if (!Array.isArray(cards)) throw new Error('サイドデッキのカードを確認してください。');
    const seen = new Set();
    for (const card of cards) {
      if (!card || !Number.isSafeInteger(card.id) || card.id <= 0 || seen.has(card.id) || (cardIds && !cardIds.has(card.id)) || !Number.isSafeInteger(card.count) || card.count < 0) throw new Error('サイドデッキのカードと枚数を確認してください。');
      seen.add(card.id);
    }
  }
  return sides;
}
export const sideLabel = name => /^サ\d+$/.test(name) ? name : Array.from(name)[0];
// Only compact count summaries use circled default side numbers.
export function sideCountLabel(name) {
  const number = /^サ([1-9]\d*)$/.exec(name)?.[1];
  if (!number) return name;
  const n = Number(number);
  if (n <= 20) return `サ${String.fromCodePoint(0x2460 + n - 1)}`;
  if (n <= 35) return `サ${String.fromCodePoint(0x3251 + n - 21)}`;
  if (n <= 50) return `サ${String.fromCodePoint(0x32b1 + n - 36)}`;
  return name;
}
