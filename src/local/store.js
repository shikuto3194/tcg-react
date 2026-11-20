import { sidesOf, validateSideSettings } from './sideDecks.js';
import { useSyncExternalStore } from 'react';
import sampleCards from '../cardData.js';
import { DEFAULT_CARD_SIZE, normalizeCardSize } from './cardSize.js';
import { openLibrary, createSaveQueue } from './persistence.js';
import { LIBRARY_FORMAT, validateLibrary, embedBackupImages } from './backup.js';
import { applyVersionToCard } from '../imageUrl.js';
import { fieldKeys, keysOf, fieldsOf, valueOf } from './cardFields.js';
import { addField, keyAt, numberOf, validateFields, fieldInUse } from './cardFields.js';
import { artworkUrl, validateArtwork } from './cardArtwork.js';
import { validateEvents } from '../analysis/validation.js';
import { validateOwned } from './ownership.js';
import { validateLimit } from './cardLimits.js';
import { PACK_OPTIONS, packTitle } from '../utils/deckPacks.js';
export { fieldKeys, keysOf, fieldsOf, valueOf } from './cardFields.js';
export { getLocalLimit } from './cardLimits.js';

// 既存データとの対応を保ち、追加項目には安定したキーを割り当てる。
const initialSettings = () => ({ labels: fieldKeys.map((_, i) => `項目${i + 1}`), source: 'folder', sideDecks: [], cardSize: { ...DEFAULT_CARD_SIZE } });
const makeSamples = () => sampleCards.map(card => ({ ...structuredClone(card), mockFolder: fieldsOf(card).pack, mockPath: fieldsOf(card).image.split('?')[0].replace(/\.png\.webp$/i, '.png'), mockLimit: '' }));
const games = new Map();
let viewMode = 'grid';
export const useCardViewMode = () => useSyncExternalStore(subscribe, () => viewMode);
export function setCardViewMode(value) { if (['list', 'grid'].includes(value)) { viewMode = value; notify(); } }
let state = { gameId: 'sample', name: '星環の庭', cards: makeSamples(), settings: { ...initialSettings(), labels: ['庭', '種類', '希少度', '種族', 'コスト', '力'], cardSize: { width: 63, height: 88 } }, mode: 'sample', events: [] };
games.set(state.gameId, state);
const memories = new Map();
let saveQueue;
let revision = crypto.randomUUID();
let receipts = {};
let transaction = false;
export const getLibraryRevision = () => revision;
export function operationReceipt(requestId, fingerprint) {
  const previous = Object.hasOwn(receipts, requestId) ? receipts[requestId] : null;
  if (!previous) return null;
  if (previous.fingerprint !== fingerprint) throw Object.assign(new Error('同じ操作IDで内容が変わっています。'), { code: 'REQUEST_ID_REUSED' });
  return structuredClone(previous.result);
}
let saveStatus = { kind: 'loading', message: '端末保存を準備中…' };
const statusListeners = new Set();
const setStatus = value => { saveStatus = value; for (const listener of statusListeners) listener(); };
export const useSaveStatus = () => useSyncExternalStore(listener => { statusListeners.add(listener); return () => statusListeners.delete(listener); }, () => saveStatus);
export const snapshotLibrary = () => ({ format: LIBRARY_FORMAT, viewMode, activeGameId: state.gameId, games: [...games.values()].map(game => ({ ...game, storage: Object.fromEntries(memories.get(game.gameId) || []) })) });
const storedSnapshot = () => ({ ...snapshotLibrary(), automation: { revision, receipts } });
function restoreDeckIds(storage, renew = false) {
  const memory = new Map(Object.entries(storage));
  if (memory.has('savedCanvasDecks')) memory.set('savedCanvasDecks', JSON.stringify(JSON.parse(memory.get('savedCanvasDecks')).map(deck => ({ ...deck, id: (!renew && deck.id) || crypto.randomUUID() }))));
  return memory;
}
const persist = () => {
  if (transaction) return;
  revision = crypto.randomUUID();
  saveQueue?.enqueue(storedSnapshot());
};
export const flushLibrary = async () => { await saveQueue?.flush(); };

export async function initializeLibrary(adapter) {
  const db = adapter || await openLibrary();
  const stored = await db.read();
  revision = typeof stored?.automation?.revision === 'string' ? stored.automation.revision : crypto.randomUUID();
  receipts = stored?.automation?.receipts || {};
  if (stored) {
    const snapshot = validateLibrary(stored);
    viewMode = snapshot.viewMode;
    games.clear(); memories.clear();
    for (const { storage, ...game } of snapshot.games) { games.set(game.gameId, { ...game, cards: game.cards.map(applyVersionToCard) }); memories.set(game.gameId, new Map(Object.entries(storage))); }
    state = games.get(snapshot.activeGameId);
  } else {
    const decks = PACK_OPTIONS.map(pack => {
      const cards = sampleCards.filter(card => fieldsOf(card).pack === pack);
      return { name: `${packTitle(pack)}のスターター`, cards: cards.map(card => ({ id: card.id, count: 2 })), tokenDeck: [], thumbnailCardId: cards[5]?.id, createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z' };
    });
    memories.set('sample', new Map([['savedCanvasDecks', JSON.stringify(decks)]]));
  }
  saveQueue = createSaveQueue(value => db.write(value), setStatus);
  for (const game of games.values()) {
    const memory = memories.get(game.gameId);
    if (memory?.has('savedCanvasDecks')) memory.set('savedCanvasDecks', JSON.stringify(JSON.parse(memory.get('savedCanvasDecks')).map(deck => ({ ...deck, id: deck.id || crypto.randomUUID() }))));
  }
  // Loading a library must not invalidate an already committed operation receipt.
  saveQueue.enqueue(storedSnapshot());
  emit();
  await flushLibrary();
}

// A synchronous mutation and its retry receipt reach IndexedDB in one snapshot.
// The caller keeps the UI idle until this promise settles. No transport owns data.
export async function transactLibrary({ requestId, fingerprint, expectedRevision }, mutate) {
  if (transaction || pendingDeckSaves.size || ownershipCommitPending) throw Object.assign(new Error('別の操作が保存中です。'), { code: 'BUSY' });
  const previous = operationReceipt(requestId, fingerprint);
  if (previous) return previous;
  if (!saveQueue) throw new Error('保存の準備ができていません。');
  if (expectedRevision !== revision) throw Object.assign(new Error('データが更新されています。読み直してから操作してください。'), { code: 'CONFLICT' });
  // Bound the journal without silently allowing an old request to execute twice.
  if (Object.keys(receipts).length >= 10000) throw Object.assign(new Error('AI操作の記録が上限に達しました。'), { code: 'JOURNAL_FULL' });
  transaction = true;
  const before = structuredClone(snapshotLibrary()), beforeRevision = revision;
  try {
    await flushLibrary().catch(async () => { saveQueue.enqueue(storedSnapshot()); await flushLibrary(); });
    const data = mutate();
    if (data && typeof data.then === 'function') throw new Error('保存操作には同期処理を指定してください。');
    validateLibrary(snapshotLibrary());
    revision = crypto.randomUUID();
    const result = { status: 'saved', revision, data: data ?? null };
    receipts = { ...receipts, [requestId]: { fingerprint, result } };
    saveQueue?.enqueue(storedSnapshot());
    await flushLibrary();
    return structuredClone(result);
  } catch (error) {
    games.clear(); memories.clear(); savedDeckSnapshots.clear();
    for (const { storage, ...game } of before.games) { games.set(game.gameId, game); memories.set(game.gameId, new Map(Object.entries(storage))); }
    state = games.get(before.activeGameId); viewMode = before.viewMode; revision = beforeRevision;
    receipts = Object.fromEntries(Object.entries(receipts).filter(([id]) => id !== requestId));
    saveQueue?.enqueue(storedSnapshot());
    await flushLibrary().catch(() => {});
    throw error;
  } finally { transaction = false; emit(); }
}

export async function exportLibrary(loadImage) { await flushLibrary().catch(() => {}); return embedBackupImages(snapshotLibrary(), loadImage); }
export function appendBackup(input) {
  const snapshot = validateLibrary(input);
  const ids = [];
  for (const { storage, ...game } of snapshot.games) {
    const gameId = `restored-${crypto.randomUUID()}`;
    games.set(gameId, { ...game, gameId, name: `${game.name}（復元）`, cards: game.cards.map(applyVersionToCard) });
    memories.set(gameId, restoreDeckIds(storage, true)); ids.push(gameId);
  }
  state = games.get(ids[0]); notify();
  return { gameIds: ids };
}
export async function restoreLibrary(input) {
  const snapshot = validateLibrary(input);
  // Restore as new games, preserving every existing game and deck.
  const restored = snapshot.games.map(({storage,...game}) => {
    const id = `restored-${globalThis.crypto.randomUUID()}`;
    return { storage, game: {...game, cards:game.cards.map(applyVersionToCard), gameId:id, name:`${game.name}（復元）`} };
  });
  for (const {storage,game} of restored) { games.set(game.gameId,game); memories.set(game.gameId,restoreDeckIds(storage, true)); }
  // Do not switch screens before the restored library has reached the device.
  revision = crypto.randomUUID();
  saveQueue?.enqueue({ ...storedSnapshot(), activeGameId: restored[0].game.gameId });
  try { await flushLibrary(); }
  catch (error) {
    for (const { game } of restored) { games.delete(game.gameId); memories.delete(game.gameId); }
    persist(); await flushLibrary().catch(() => {});
    throw error;
  }
  state = restored[0].game;
  emit();
  return restored.length;
}
const listeners = new Set();
const emit = () => { if (!transaction) for (const listener of listeners) listener(); };
const notify = () => { games.set(state.gameId, state); persist(); emit(); };
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const EMPTY_EVENTS = Object.freeze([]);
export const getEvents = (gameId = state.gameId) => games.get(gameId)?.events || EMPTY_EVENTS;
export const useEvents = gameId => useSyncExternalStore(subscribe, () => getEvents(gameId));
function updateEvents(gameId, events) {
  const game = games.get(gameId);
  if (!game) throw new Error('ゲームが見つかりません。');
  const updated = { ...game, events: validateEvents(events) };
  games.set(gameId, updated);
  if (state.gameId === gameId) state = updated;
  notify();
}
export function putEvent(gameId, event) {
  const saved = validateEvents([event])[0];
  updateEvents(gameId, [...getEvents(gameId).filter(row => row.id !== saved.id), saved].sort((a, b) => b.at.localeCompare(a.at)));
}
export function removeEvent(gameId, id) {
  updateEvents(gameId, getEvents(gameId).filter(event => event.id !== id));
}
// 生成画像は表示用だけに付ける。保存・バックアップの正本は空のimageとカード情報。
const presentations = new WeakMap();
const artworkFaces = new WeakMap();
function presentation() {
  if (!presentations.has(state)) {
    const drawing = { ...state.settings, gameName: state.name };
    const faceImage = face => {
      if (face.image) return face;
      const cached = artworkFaces.get(face);
      if (cached?.settings === state.settings && cached.name === state.name) return cached.face;
      const result = { ...face, image: artworkUrl(face, drawing), generatedArtwork: true };
      artworkFaces.set(face, { settings: state.settings, name: state.name, face: result });
      return result;
    };
    const cards = state.cards.map(card => card.isDoubleSided ? { ...card, front: faceImage(card.front), back: faceImage(card.back) } : faceImage(card));
    presentations.set(state, { ...state, cards });
  }
  return presentations.get(state);
}
export const useLocal = () => useSyncExternalStore(subscribe, presentation);
export const getLocalCards = () => presentation().cards;
export const getLocalSettings = () => state.settings;
export const fieldLabel = key => state.settings.labels[keysOf(state.settings).indexOf(key)] || key;

// 呼び出し時のゲームに固定し、切替時の書き込み混入を防ぐ。
export function getLocalStorage(gameId = state.gameId) {
  if (!memories.has(gameId)) memories.set(gameId, new Map());
  const memory = memories.get(gameId);
  return { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { const text = String(value); if (memory.get(key) !== text) { memory.set(key, text); persist(); emit(); } } };
}
// The game store owns saved decks; components subscribe instead of mirroring them.
const savedDeckSnapshots = new Map();
export function getSavedDecks(gameId = state.gameId) {
  const text = getLocalStorage(gameId).getItem('savedCanvasDecks') || '[]';
  const previous = savedDeckSnapshots.get(gameId);
  if (previous?.text === text) return previous.decks;
  const decks = JSON.parse(text);
  savedDeckSnapshots.set(gameId, { text, decks });
  return decks;
}
export const useSavedDecks = gameId => useSyncExternalStore(subscribe, () => getSavedDecks(gameId));
export function setSavedDecks(gameId, update) {
  if (!games.has(gameId)) throw new Error('ゲームが見つかりません。');
  const next = typeof update === 'function' ? update(getSavedDecks(gameId)) : update;
  const existing = getSavedDecks(gameId);
  getLocalStorage(gameId).setItem('savedCanvasDecks', JSON.stringify(next.map(deck => ({ ...deck, id: deck.id || existing.find(row => row.name === deck.name)?.id || crypto.randomUUID() }))));
}
const draftSnapshots = new Map();
export function getDraft(gameId = state.gameId) {
  const text = getLocalStorage(gameId).getItem('draft') || '{}';
  if (draftSnapshots.get(gameId)?.text !== text) draftSnapshots.set(gameId, { text, value: JSON.parse(text) });
  return draftSnapshots.get(gameId).value;
}
export const useDraft = gameId => useSyncExternalStore(subscribe, () => getDraft(gameId));
export function updateDraft(gameId, patch) {
  if (!games.has(gameId)) throw new Error('ゲームが見つかりません。');
  const before = getDraft(gameId);
  getLocalStorage(gameId).setItem('draft', JSON.stringify({ ...before, ...(typeof patch === 'function' ? patch(before) : patch) }));
}
const pendingDeckSaves = new Set();
export async function commitSavedDecks(gameId, update) {
  if (!games.has(gameId)) throw new Error('ゲームが見つかりません。');
  if (pendingDeckSaves.has(gameId)) throw new Error('保存が終わるまでお待ちください。');
  const storage = getLocalStorage(gameId);
  const before = storage.getItem('savedCanvasDecks') || '[]';
  const next = JSON.stringify(typeof update === 'function' ? update(getSavedDecks(gameId)) : update);
  let applied;
  pendingDeckSaves.add(gameId);
  try {
    setSavedDecks(gameId, JSON.parse(next));
    applied = storage.getItem('savedCanvasDecks');
    await flushLibrary();
  } catch (error) {
    // A failed save must not become a later, unrelated autosave.
    if (storage.getItem('savedCanvasDecks') === applied) {
      storage.setItem('savedCanvasDecks', before);
      await flushLibrary().catch(() => {});
    }
    throw error;
  } finally { pendingDeckSaves.delete(gameId); }
}
export function getGames() {
  return [...games.values()].map(game => ({ id: game.gameId, name: game.name, cards: game.cards.length, decks: getSavedDecks(game.gameId).length }));
}
export function switchGame(id) {
  if (!games.has(id)) throw new Error('ゲームが見つかりません。');
  state = games.get(id);
  notify();
}
export function createGame(name) {
  if (!name.trim()) throw new Error('ゲーム名を入力してください。');
  // Never reuse a deleted ID, including after restarting the app.
  state = { gameId: `game-${crypto.randomUUID()}`, name: name.trim(), cards: [], settings: initialSettings(), mode: 'empty', events: [] };
  notify();
  return state.gameId;
}
// Game deletion is UI-only and uses the existing atomic library transaction.
export function deleteGame(gameId) {
  if (!transaction) throw new Error('ゲームの削除は保存処理を通して行ってください。');
  if (!games.has(gameId)) throw Object.assign(new Error('ゲームが見つかりません。'), { code: 'NOT_FOUND' });
  games.delete(gameId); memories.delete(gameId);
  savedDeckSnapshots.delete(gameId); draftSnapshots.delete(gameId);
  if (state.gameId === gameId) {
    if (games.size) state = games.values().next().value;
    else createGame('新しいゲーム');
  }
  notify();
  return { deletedGameId: gameId, gameId: state.gameId };
}
export function commitGameDeletion(gameId, expectedRevision) {
  return transactLibrary({ requestId: crypto.randomUUID(), fingerprint: JSON.stringify({ action: 'deleteGame', gameId }), expectedRevision }, () => deleteGame(gameId));
}
function withPack(card, settings) {
  const sideWithPack = side => ({ ...side, pack: settings.source === 'folder' ? card.mockFolder || '' : valueOf(side, settings.source) });
  return card.isDoubleSided ? { ...card, front: sideWithPack(card.front), back: sideWithPack(card.back) } : sideWithPack(card);
}
export function applySettings(settings, name = state.name) {
  name = name.trim();
  if (!name) throw new Error('ゲーム名を入力してください。');
  settings = { ...settings, sideDecks: validateSideSettings(settings.sideDecks), cardSize: normalizeCardSize(settings.cardSize ?? state.settings.cardSize) };
  const nextKeys = validateFields(settings);
  if (keysOf(state.settings).some(key => !nextKeys.includes(key) && fieldInUse(state.cards, key, settings.source))) throw new Error('使われている項目は削除できません。カードの値を空欄にし、セット名には別の項目かフォルダ名を選んでください。');
  const removed = (state.settings.sideDecks || []).filter(side => !settings.sideDecks.some(next => next.id === side.id));
  const memory = getLocalStorage();
  const decks = [...JSON.parse(memory.getItem('savedCanvasDecks') || '[]'), JSON.parse(memory.getItem('draft') || '{}')];
  if (removed.some(side => decks.some(deck => (sidesOf(deck)[side.id] || []).some(card => card.count > 0)))) throw new Error('カードが入っているサイドデッキは削除できません。作成中・保存デッキから先にカードを外してください。');
  // Empty removed zones can be discarded without changing any card counts.
  const clean = deck => ({ ...deck, sideDecks: Object.fromEntries(Object.entries(sidesOf(deck)).filter(([id]) => settings.sideDecks.some(side => side.id === id))), tokenDeck: [] });
  const cards = state.cards.map(card => withPack(card, settings));
  for (const card of cards) for (const face of card.isDoubleSided ? [card.front, card.back] : [card]) validateArtwork(face, { ...settings, gameName: name });
  if (removed.length) { memory.setItem('savedCanvasDecks', JSON.stringify(decks.slice(0, -1).map(clean))); memory.setItem('draft', JSON.stringify(clean(decks.at(-1)))); }
  state = { ...state, name, cards, settings };
  notify();
}
export function selectSamples(mode) {
  let cards = mode === 'empty' ? [] : makeSamples();
  if (mode === 'images') cards = cards.map(card => {
    const minimal = side => ({ name: side.cardNumber || side.name, image: side.image, cardNumber: side.cardNumber || '', pack: side.pack, cost: '', type: '', color: [], reduction: [], symbol: [], tribe: '', rarity: '', effect: '' });
    return card.isDoubleSided ? { id: card.id, name: card.name, isDoubleSided: true, front: minimal(card.front), back: minimal(card.back), mockFolder: card.mockFolder, mockPath: card.mockPath } : { ...minimal(card), id: card.id, mockFolder: card.mockFolder, mockPath: card.mockPath };
  });
  state = { ...state, cards, settings: initialSettings(), mode };
  memories.get(state.gameId)?.clear();
  notify();
}
function appendImages(cards, entries, settings) {
  const known = new Set(cards.map(card => card.mockPath));
  let nextId = Math.max(1000, ...cards.map(card => card.id)) + 1;
  const added = [];
  for (const entry of entries) {
    if (known.has(entry.path)) { cards = cards.map(card => card.mockPath === entry.path ? (card.isDoubleSided ? { ...card, front: { ...card.front, image: entry.image } } : { ...card, image: entry.image }) : card); continue; }
    known.add(entry.path);
    const parts = entry.path.split('/');
    const folder = parts.length > 1 ? parts.at(-2) : '';
    added.push(withPack({ id: nextId++, name: parts.at(-1).replace(/\.[^.]+$/, ''), image: entry.image, cardNumber: '', mockPath: entry.path, mockFolder: folder, mockLimit: '', cost: '', type: '', color: [], reduction: [], symbol: [], tribe: '', rarity: '', effect: '' }, settings));
  }
  return [...added, ...cards];
}
export function addImages(entries) {
  const cards = appendImages(state.cards, entries, state.settings);
  const count = cards.length - state.cards.length;
  state = { ...state, cards };
  notify();
  return count;
}
let ownershipCommitPending = false;
export async function commitOwnedCounts(gameId, input) {
  if (ownershipCommitPending) throw new Error('保存が終わるまでお待ちください。');
  const game = games.get(gameId);
  if (!game || state.gameId !== gameId) throw new Error('編集中のゲームを確認してください。');
  const counts = new Map(Object.entries(input).map(([id, value]) => [Number(id), validateOwned(value)]));
  if ([...counts.keys()].some(id => !game.cards.some(card => card.id === id))) throw new Error('カードが見つかりません。');
  if (!counts.size) return;
  const before = new Map(game.cards.filter(card => counts.has(card.id)).map(card => [card.id, card]));
  ownershipCommitPending = true;
  state = { ...game, cards: game.cards.map(card => counts.has(card.id) ? { ...card, ownedCount: counts.get(card.id) } : card) };
  notify();
  try { await flushLibrary(); }
  catch (error) {
    // Remove failed values from memory and the save queue so Cancel cannot save them later.
    const current = games.get(gameId);
    const restored = { ...current, cards: current.cards.map(card => {
      const old = before.get(card.id);
      if (!old) return card;
      const next = { ...card };
      if (Object.hasOwn(old, 'ownedCount')) next.ownedCount = old.ownedCount;
      else delete next.ownedCount;
      return next;
    }) };
    games.set(gameId, restored);
    if (state.gameId === gameId) state = restored;
    notify();
    await flushLibrary().catch(() => {});
    throw error;
  } finally { ownershipCommitPending = false; }
}
function editedCard(card, side, draft, settings) {
  const face = side ? card[side] : card;
  const updated = { ...face };
  for (const key of ['name', 'cardNumber', 'effect', ...keysOf(settings)]) {
    if (!Object.hasOwn(draft, key)) continue;
    const value = String(draft[key] ?? '');
    updated[key] = ['color', 'reduction', 'symbol'].includes(key) ? value.split('・').map(item => item.trim()).filter(Boolean) : value;
  }
  if (!updated.name?.trim()) throw new Error('カード名を入力してください。');
  let result = side ? { ...card, [side]: updated, ...(side === 'front' ? { name: updated.name } : {}) } : updated;
  if (Object.hasOwn(draft, 'limit')) result = { ...result, mockLimit: validateLimit(draft.limit) };
  if (Object.hasOwn(draft, 'ownedCount')) result = { ...result, ownedCount: validateOwned(draft.ownedCount) };
  result = withPack(result, settings);
  validateArtwork(side ? result[side] : result, { ...settings, gameName: state.name });
  return result;
}
function replaceCard(cards, updated) {
  const previous = cards.find(card => card.id === updated.id);
  return cards.map(card => {
    const next = card.id === updated.id ? updated : card;
    return previous.name !== updated.name && next.relatedTokens
      ? { ...next, relatedTokens: next.relatedTokens.map(name => name === previous.name ? updated.name : name) }
      : next;
  });
}
export function editCard(id, side, draft) {
  const card = state.cards.find(card => card.id === id);
  if (!card) throw new Error('カードが見つかりません。');
  const cards = replaceCard(state.cards, editedCard(card, side, draft, state.settings));
  state = { ...state, cards };
  notify();
}

export function addCard(draft) {
  const card = editedCard({ id: Math.max(1000, ...state.cards.map(card => card.id)) + 1, image: '', mockFolder: '', mockLimit: '' }, null, draft, state.settings);
  state = { ...state, cards: [card, ...state.cards] };
  notify();
  return card.id;
}

// 全ファイルを検証後に一括反映。不正なデータがあれば画像追加も取り消す。
export function importCardFiles(images, rows) {
  let cards = appendImages(state.cards, images, state.settings);
  let settings = structuredClone(state.settings);
  for (const { record } of rows) {
    for (const key of Object.keys(record)) {
      const match = /^item([1-9]\d*)$/.exec(key);
      if (match && Number(match[1]) > 100) throw new Error('読み込める項目は100個までです。');
      if (match) {
        const number = Number(match[1]);
        if (settings.fieldKeys) { if (!keysOf(settings).includes(keyAt(number))) settings = addField(settings, number); }
        else while (settings.labels.length < number) settings.labels.push(`項目${settings.labels.length + 1}`);
      }
    }
  }
  for (const { record, source } of rows) {
    const imagePath = String(record.image || '').replaceAll('\\', '/').replace(/^\.\//, '');
    const directory = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : '';
    const isNew = !imagePath && (record.id == null || record.id === '');
    const candidates = isNew ? [{ id: Math.max(1000, ...cards.map(card => card.id)) + 1, image: '', name: '', mockFolder: '', mockLimit: '' }] : cards.filter(card => imagePath ? [imagePath, directory + imagePath].includes(card.mockPath) : card.id === Number(record.id));
    if (candidates.length !== 1) throw new Error(`${source}: ${imagePath || record.id || '画像指定なし'} のカードを確認できません。imageにCSV／JSONから見た画像の場所を指定してください。`);
    const card = candidates[0];
    if (isNew && record.side) throw new Error(`${source}: 画像なしカードの新規追加ではsideを省いてください。`);
    const side = card.isDoubleSided ? (record.side || 'front') : null;
    if (side && !['front', 'back'].includes(side)) throw new Error(`${source}: sideは表ならfront、裏ならbackにしてください。`);
    const draft = {};
    for (const key of Object.keys(record)) {
      if (!['image', 'id', 'side', 'name', 'cardNumber', 'effect', 'limit', 'ownedCount'].includes(key) && !/^item[1-9]\d*$/.test(key)) throw new Error(`${source}: 列「${key}」は使えません。書式例を確認してください。`);
      if (record[key] != null && !['string', 'number'].includes(typeof record[key])) throw new Error(`${source}: ${key}には文字か数値を入力してください。`);
    }
    for (const key of ['name', 'cardNumber', 'effect', 'limit', 'ownedCount']) if (Object.hasOwn(record, key)) draft[key] = record[key];
    keysOf(settings).forEach(key => { const column = `item${numberOf(key)}`; if (Object.hasOwn(record, column)) draft[key] = record[column]; });
    const updated = editedCard(card, side, draft, settings);
    cards = isNew ? [updated, ...cards] : replaceCard(cards, updated);
  }
  const added = cards.length - state.cards.length;
  state = { ...state, cards, settings };
  notify();
  return { added, updated: rows.length };
}
export function matchesLocalCard(card, search, filters, pack) {
  const faces = card.isDoubleSided ? [card.front, card.back] : [card];
  const keys = keysOf(state.settings);
  const query = search.toLowerCase();
  return faces.some(face => [face.name, face.cardNumber, face.effect, face.pack, ...keys.map(key => valueOf(face, key))].join(' ').toLowerCase().includes(query))
    && (!pack || faces.some(face => face.pack === pack))
    && keys.every((key, i) => { const value = Array.isArray(filters) ? filters[i] : filters[key]; return !value || faces.some(face => valueOf(face, key) === value); });
}
