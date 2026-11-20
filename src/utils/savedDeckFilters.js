import { comparePacks } from './deckPacks.js';

export const EMPTY_DECK_FILTERS = { color: '', tribe: '', pack: '', type: '' };
export const NO_TYPE = '未設定';
export const DECK_FILTER_LABELS = { color: '色', tribe: '系統', pack: '収録パック', type: '項目2' };
const fields = Object.keys(EMPTY_DECK_FILTERS);
const colorOrder = ['赤', '紫', '緑', '白', '黄', '青', '黒', '無色', '多色'];
const collator = new Intl.Collator('ja', { numeric: true });
const normalize = value => String(value ?? '').trim().toLocaleLowerCase('ja');

// Saved-deck filters describe main-deck copies and both printed faces.
export function createDeckProfile(entries) {
  const cards = [];
  let total = 0;
  for (const entry of entries) {
    const count = Number(entry.count);
    if (!Number.isFinite(count) || count <= 0) continue;
    const values = { color: new Set(), tribe: new Set(), pack: new Set(), type: new Set() };
    for (const face of entry.faces) {
      for (const color of face.colors || []) if (color) values.color.add(color);
      for (const tribe of (face.tribe || '').split(/[・/／]/)) if (tribe.trim()) values.tribe.add(tribe.trim());
      if (face.pack) values.pack.add(face.pack);
      if (face.type?.trim()) values.type.add(face.type.trim());
    }
    if (values.color.size > 1) values.color.add('多色');
    cards.push({ count, values });
    total += count;
  }
  return { cards, total };
}

export function getDeckFilterOptions(profiles) {
  const counts = Object.fromEntries(fields.map(field => [field, new Map()]));
  for (const profile of profiles) {
    for (const field of fields) {
      const values = new Set(profile.cards.flatMap(card => [...card.values[field]]));
      if (field === 'type' && !values.size) values.add(NO_TYPE);
      for (const value of values) counts[field].set(value, (counts[field].get(value) || 0) + 1);
    }
  }
  return Object.fromEntries(fields.map(field => [field, [...counts[field]].map(([value, count]) => ({ value, count })).sort((a, b) => {
    if (field === 'pack') return comparePacks(a.value, b.value);
    const order = field === 'color' ? colorOrder : [];
    const rank = value => order.indexOf(value) < 0 ? Infinity : order.indexOf(value);
    return (rank(a.value) - rank(b.value) || 0) || collator.compare(a.value, b.value);
  })]));
}

export function matchDeckProfile(profile, filters) {
  const active = fields.filter(field => field === 'pack' ? Boolean(filters[field]) : normalize(filters[field]));
  if (!active.length) return { matches: true, score: null };
  const shares = active.map(field => {
    const query = field === 'pack' ? filters[field] : normalize(filters[field]);
    if (field === 'type' && query === normalize(NO_TYPE)) {
      return profile.cards.some(card => card.values.type.size) ? 0 : 1;
    }
    const count = profile.cards.reduce((sum, card) => {
      const matches = [...card.values[field]].some(value =>
        field === 'pack' ? value === query : field === 'tribe' || field === 'type' ? normalize(value).includes(query) : normalize(value) === query
      );
      return sum + (matches ? card.count : 0);
    }, 0);
    return profile.total ? count / profile.total : 0;
  });
  return { matches: shares.every(share => share > 0), score: shares.reduce((sum, share) => sum + share, 0) / shares.length };
}

export function profileFromSavedCards(cards) {
  return createDeckProfile(cards.map(card => ({
    count: card.count,
    faces: (card.isDoubleSided ? [card.front, card.back] : [card]).filter(Boolean).map(face => ({
      colors: face.color || [], tribe: face.tribe, pack: face.pack || card.pack,
      type: face.type || '',
    })),
  })));
}
