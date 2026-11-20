import { cardPack, comparePacks } from '../utils/deckPacks.js';
import { sidesOf } from './sideDecks.js';

export const ownedValue = value => value == null || value === '' ? '' : Number(value);
export const ownedText = value => ownedValue(value) === '' ? '未入力' : `${value}枚`;
export function validateOwned(value) {
  if (value === '' || value == null) return '';
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('所持枚数は0以上の整数、または空欄にしてください。');
  return Number(value);
}
export const ownedSnapshot = cards => Object.fromEntries(cards.map(card => [card.id, ownedValue(card.ownedCount)]));
export function matchesOwnership(value, filter, used = 0) {
  const owned = ownedValue(value);
  if (filter === 'owned') return owned > 0;
  if (filter === 'zero') return owned === 0;
  if (filter === 'unknown') return owned === '';
  if (filter === 'shortage') return owned !== '' && used > owned;
  return true;
}
export function ownershipUsage(savedDecks, sideSettings = []) {
  const result = new Map();
  for (const deck of savedDecks) {
    const zones = [{ name: 'メイン', cards: deck.cards || [] }, ...Object.entries(sidesOf(deck)).map(([id, cards]) => ({ name: sideSettings.find(side => side.id === id)?.name || 'サイド', cards }))];
    for (const zone of zones) for (const card of zone.cards) {
      if (!card.count) continue;
      const entry = result.get(card.id) || { total: 0, entries: [] };
      entry.total += card.count;
      entry.entries.push({ deck: deck.name, zone: zone.name, count: card.count });
      result.set(card.id, entry);
    }
  }
  return result;
}
export function ownershipShortages(cards, savedDecks) {
  const usage = ownershipUsage(savedDecks);
  return cards.filter(card => matchesOwnership(card.ownedCount, 'shortage', usage.get(card.id)?.total))
    .map(card => ({ ...card, usedCount: usage.get(card.id).total, shortage: usage.get(card.id).total - ownedValue(card.ownedCount) }))
    .sort((a, b) => b.shortage - a.shortage || a.id - b.id);
}
export function ownershipSummary(cards) {
  const empty = () => ({ registered: 0, owned: 0, total: 0, zero: 0, unknown: 0 });
  const all = empty(), packs = new Map();
  for (const card of cards) {
    // A double-sided physical card counts once, under its front set (back as fallback).
    const pack = cardPack(card);
    if (!packs.has(pack)) packs.set(pack, empty());
    for (const group of [all, packs.get(pack)]) {
      const count = ownedValue(card.ownedCount);
      group.registered++;
      if (count === '') group.unknown++;
      else if (count === 0) group.zero++;
      else { group.owned++; group.total += count; }
    }
  }
  return { ...all, packs: [...packs].sort(([a], [b]) => comparePacks(a, b)).map(([name, counts]) => ({ name, ...counts })) };
}
