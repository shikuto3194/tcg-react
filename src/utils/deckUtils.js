import { cardPack, comparePacks } from './deckPacks.js';

// Local assets stay relative to the app's base directory.
export const toAbsPath = (p) => p;

// リハイドレート（minimal → full card）
export function rehydrateCard(saved, catalog) {
  if (!saved) return saved;
  const base = catalog.get(Number(saved.id));
  if (!base) return saved;
  return { ...base, count: saved.count ?? base.count ?? 0, isDeckThumbnail: !!saved.isDeckThumbnail };
}

export function rehydrateCards(savedCards = [], catalog) {
  return savedCards.map(saved => rehydrateCard(saved, catalog));
}

export function sortDeckCards(cards) {
  return [...cards].sort((a, b) => {
    const costA = Number((a.isDoubleSided && a.front ? a.front.cost : a.cost) ?? '');
    const costB = Number((b.isDoubleSided && b.front ? b.front.cost : b.cost) ?? '');
    // Normalize each value before comparing, so mixed text/numeric costs cannot
    // create contradictory pairwise ordering. Unentered values also use zero.
    const costDifference = (Number.isFinite(costA) ? costA : 0) - (Number.isFinite(costB) ? costB : 0);
    if (costDifference) return costDifference;
    const packDifference = comparePacks(cardPack(a), cardPack(b));
    if (packDifference) return packDifference;
    const nameA = a.isDoubleSided && a.front ? a.front.name : a.name;
    const nameB = b.isDoubleSided && b.front ? b.front.name : b.name;
    return String(nameA ?? '').localeCompare(String(nameB ?? ''), 'ja');
  });
}
