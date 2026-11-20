import Ajv from 'ajv';
import { operations } from './catalog.js';
import { getUI } from './ui.js';
import * as library from '../local/store.js';
import { clearDraft, setDraftCount } from '../local/draft.js';
import { prepareDraftSave, draftForDeck } from '../local/deckActions.js';
import { prepareDeckImport } from '../local/deckJson.js';
import { parseCardData } from '../local/importData.js';
import { blobData, deckFiles, imageData } from '../local/outputFiles.js';
import { allDeckCards } from '../local/sideDecks.js';
import { ownedValue, matchesOwnership, ownershipUsage, ownershipShortages, ownershipSummary } from '../local/ownership.js';
import { filterEvents, createEvent, createMatch, createGameRecord, snapshotDeck, summarize, winRate, dailyResults, groupRecords } from '../analysis/model.js';
import { matchDeckProfile, profileFromSavedCards } from '../utils/savedDeckFilters.js';
import { sortSavedDecks, withDeckSaveTimes } from '../utils/savedDeckSort.js';
import { cardPack } from '../utils/deckPacks.js';
import { validateLibrary } from '../local/backup.js';
import { inspectScreen, actOnScreen } from './screen.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map(operations.map(operation => [operation.name, ajv.compile(operation.inputSchema)]));
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const withoutImages = value => JSON.parse(JSON.stringify(value, (key, value) => key === 'image' ? undefined : value));
const findDeck = id => library.getSavedDecks().find(deck => deck.id === id) || fail('NOT_FOUND', 'デッキが見つかりません。');
const findCard = id => library.getLocalCards().find(card => card.id === id) || fail('NOT_FOUND', 'カードが見つかりません。');
const requireOverwrite = (exists, allowed) => { if (exists && !allowed) fail('CONFIRMATION_REQUIRED', '同名のデッキがあります。上書きする場合はoverwriteを指定してください。'); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
let executing = false;

async function verifyImages(images) {
  for (const src of new Set(images)) {
    if (!src) continue;
    await new Promise((resolve, reject) => { const image = new Image(); image.onload = resolve; image.onerror = () => reject(new Error('開けない画像があります。')); image.src = src; });
  }
}
export async function executeOperation(name, args = {}) {
  const operation = operations.find(operation => operation.name === name);
  if (!operation) fail('UNKNOWN_OPERATION', '対応していない操作です。');
  const validate = validators.get(name);
  if (!validate(args)) fail('INVALID_INPUT', ajv.errorsText(validate.errors));
  if (executing) fail('BUSY', '別のAI操作を実行中です。');
  const key = operation.key;
  executing = true;
  const root = globalThis.document?.getElementById('root');
  const inert = root?.inert;
  if (operation.writes && root) root.inert = true;
  try {
    const digest = operation.writes ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical({ name, args })))) : null;
    const fingerprint = digest ? [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') : '';
    if (operation.writes) { const previous = library.operationReceipt(args.requestId, fingerprint); if (previous) return previous; }
    const snapshot = library.snapshotLibrary();
    if (args.gameId && key !== 'game_select' && args.gameId !== snapshot.activeGameId) fail('GAME_MISMATCH', '先に対象のゲームへ切り替えてください。');
    if (operation.writes && getUI()?.busy()) fail('EDIT_IN_PROGRESS', '画面の編集を完了するか、キャンセルしてから操作してください。');
    if (key === 'cards_import') {
      const bytes = (args.files || []).reduce((sum, file) => sum + new TextEncoder().encode(file.text).byteLength, 0) + (args.images || []).reduce((sum, file) => sum + Math.floor((file.image.split(',')[1] || '').replace(/=+$/, '').length * 3 / 4), 0);
      if (bytes > 100 * 1024 * 1024) fail('TOO_LARGE', '1回に読み込めるのは合計100MBまでです。');
      for (const image of args.images || []) {
        if (!image.path || image.path.startsWith('/') || image.path.includes('\\') || image.path.split('/').some(part => part === '..' || part === '.' || !part) || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image.image)) fail('INVALID_INPUT', '画像の相対名と形式を確認してください。');
      }
      await verifyImages((args.images || []).map(image => image.image));
    }
    if (key === 'backup_restore') {
      if (new TextEncoder().encode(JSON.stringify(args.backup)).byteLength > 500 * 1024 * 1024) fail('TOO_LARGE', '復元できるファイルは500MBまでです。');
      const checked = validateLibrary(args.backup);
      await verifyImages(checked.games.flatMap(game => game.cards.flatMap(card => card.isDoubleSided ? [card.front.image, card.back.image] : [card.image])));
    }
    if (!operation.writes) {
      const revision = library.getLibraryRevision(), data = await readOperation(key, args);
      const changedUI = ['ui_set', 'ui_act'].includes(key);
      return { status: changedUI ? 'dispatched' : 'ready', revision: changedUI ? library.getLibraryRevision() : revision, data };
    }
    return await library.transactLibrary({ ...args, fingerprint }, () => writeOperation(key, args));
  } finally { executing = false; if (root) root.inert = inert; }
}

function writeOperation(key, args) {
  const gameId = library.snapshotLibrary().activeGameId;
  switch (key) {
    case 'game_create': return { gameId: library.createGame(args.name) };
    case 'game_select': library.switchGame(args.gameId); return { gameId: args.gameId };
    case 'settings_update': library.applySettings(args.settings, args.name); return null;
    case 'cards_add': return { cardId: library.addCard(args.card) };
    case 'cards_update': {
      const card = findCard(args.cardId);
      if (card.isDoubleSided && !args.face) fail('INVALID_INPUT', '両面カードはfaceを指定してください。');
      if (!card.isDoubleSided && args.face) fail('INVALID_INPUT', '片面カードにfaceは指定できません。');
      library.editCard(args.cardId, args.face || null, args.patch); return { cardId: args.cardId };
    }
    case 'cards_import': return library.importCardFiles(args.images || [], (args.files || []).flatMap(file => parseCardData(file.text, file.name)));
    case 'draft_set_count': setDraftCount(gameId, args.zoneId, args.cardId, args.count); return null;
    case 'draft_configure': {
      const patch = {};
      if (Object.hasOwn(args, 'name')) patch.deckName = args.name;
      if (Object.hasOwn(args, 'thumbnailCardId')) {
        if (args.thumbnailCardId !== null && !allDeckCards(library.getDraft()).some(card => card.id === args.thumbnailCardId)) fail('INVALID_INPUT', 'サムネイルにはデッキ内のカードを指定してください。');
        patch.deckThumbnailCardId = args.thumbnailCardId;
      }
      library.updateDraft(gameId, patch); return null;
    }
    case 'draft_clear': clearDraft(gameId); return null;
    case 'draft_load': library.updateDraft(gameId, draftForDeck(findDeck(args.deckId))); return null;
    case 'draft_save': {
      const { deck, decks, overwrite } = prepareDraftSave(library.getDraft(), library.getSavedDecks());
      requireOverwrite(overwrite, args.overwrite);
      library.setSavedDecks(gameId, decks); library.updateDraft(gameId, { deckName: '', currentDeckName: deck.name });
      return { deckId: deck.id, name: deck.name };
    }
    case 'decks_delete': {
      const deck = findDeck(args.deckId);
      library.setSavedDecks(gameId, library.getSavedDecks().filter(row => row.id !== deck.id));
      if (library.getDraft().currentDeckName === deck.name) clearDraft(gameId);
      return null;
    }
    case 'decks_import': {
      const deck = prepareDeckImport(args.deck, library.getLocalSettings(), library.getLocalCards());
      const existing = library.getSavedDecks().find(row => row.name === deck.name);
      requireOverwrite(existing, args.overwrite);
      const saved = withDeckSaveTimes({ ...deck, id: existing?.id || crypto.randomUUID() }, existing);
      library.setSavedDecks(gameId, [...library.getSavedDecks().filter(row => row !== existing), saved]);
      return { deckId: saved.id };
    }
    case 'ownership_set': {
      if (new Set(args.counts.map(row => row.cardId)).size !== args.counts.length) fail('INVALID_INPUT', '同じカードが重複しています。');
      for (const row of args.counts) { const card = findCard(row.cardId); library.editCard(card.id, card.isDoubleSided ? 'front' : null, { ownedCount: row.count }); }
      return null;
    }
    case 'events_put': {
      const event = { ...createEvent(), ...args.event };
      const prepareSnapshot = row => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) fail('INVALID_INPUT', '戦績の形式を確認してください。');
        const { deckId, registeredDeckId, ...record } = row;
        if (deckId && registeredDeckId) fail('INVALID_INPUT', '保存デッキか登録デッキのどちらかを指定してください。');
        if (deckId) Object.assign(record, snapshotDeck(findDeck(deckId), library.getLocalSettings().sideDecks));
        if (registeredDeckId) {
          const deck = event.decks.find(deck => deck.id === registeredDeckId);
          if (!deck) fail('NOT_FOUND', 'イベントの登録デッキが見つかりません。');
          const { id: _id, ...snapshot } = deck;
          Object.assign(record, structuredClone(snapshot));
        }
        return record;
      };
      if (!Array.isArray(event.decks) || !Array.isArray(event.matches)) fail('INVALID_INPUT', '戦績の形式を確認してください。');
      event.decks = event.decks.map(row => {
        if (row?.registeredDeckId) fail('INVALID_INPUT', 'イベントの登録には保存デッキを指定してください。');
        return { id: crypto.randomUUID(), deckName: '', cards: [], ...prepareSnapshot(row) };
      });
      event.matches = (event.matches || []).map(row => {
        const match = { ...createMatch(), ...prepareSnapshot(row) };
        if (!Array.isArray(match.games)) fail('INVALID_INPUT', 'ゲーム内訳の形式を確認してください。');
        match.games = match.games.map(game => ({ ...createGameRecord(), ...prepareSnapshot(game) }));
        return match;
      });
      library.putEvent(gameId, event); return { eventId: event.id };
    }
    case 'events_delete':
      if (!library.getEvents().some(event => event.id === args.eventId)) fail('NOT_FOUND', 'イベントが見つかりません。');
      library.removeEvent(gameId, args.eventId); return null;
    case 'backup_restore': return library.appendBackup(args.backup);
    default: fail('UNKNOWN_OPERATION', '対応していない操作です。');
  }
}

async function readOperation(key, args) {
  const cards = library.getLocalCards(), settings = library.getLocalSettings(), decks = library.getSavedDecks();
  switch (key) {
    case 'status': return { apiVersion: 1, gameId: library.snapshotLibrary().activeGameId, editing: !!getUI()?.busy(), transport: 'local', backgroundExecution: 'not_verified' };
    case 'games_list': return library.getGames();
    case 'settings_get': return { name: library.snapshotLibrary().games.find(game => game.gameId === args.gameId).name, ...settings, fieldKeys: library.keysOf(settings) };
    case 'cards_search': {
      const keys = library.keysOf(settings);
      const unknown = Object.keys(args.fields || {}).filter(key => !keys.includes(key));
      if (unknown.length) fail('INVALID_SEARCH_FIELD', `不明な検索キー: ${unknown.join(', ')}。有効なキー: ${keys.map((key, index) => `${key}（${settings.labels[index]}）`).join(', ') || 'なし'}。tcg_settings_getのfieldKeysとlabelsを確認してください。`);
      const usage = ownershipUsage(decks, settings.sideDecks);
      const matches = cards.filter(card => library.matchesLocalCard(card, args.query || '', args.fields || {}, args.pack || '') && matchesOwnership(card.ownedCount, args.ownership, usage.get(card.id)?.total));
      const offset = args.offset || 0;
      return { total: matches.length, offset, cards: withoutImages(matches.slice(offset, offset + (args.limit || 50))) };
    }
    case 'cards_get': return args.includeImages ? findCard(args.cardId) : withoutImages(findCard(args.cardId));
    case 'draft_get': return library.getDraft();
    case 'decks_get': return findDeck(args.deckId);
    case 'decks_search': {
      const catalog = new Map(cards.map(card => [card.id, card]));
      const hydrated = deck => deck.cards.map(card => ({ ...catalog.get(card.id), count: card.count }));
      const profiles = new Map(decks.map(deck => [deck, matchDeckProfile(profileFromSavedCards(hydrated(deck)), args.filters || {})]));
      return sortSavedDecks(decks.filter(deck => deck.name.toLowerCase().includes((args.query || '').trim().toLowerCase()) && profiles.get(deck).matches), args.sort || 'hit', args.direction || 'desc', deck => hydrated(deck).map(card => ({ pack: cardPack(card), count: card.count })), deck => profiles.get(deck).score);
    }
    case 'ownership_get': return { counts: cards.map(card => ({ cardId: card.id, count: ownedValue(card.ownedCount) })), summary: ownershipSummary(cards), usage: Object.fromEntries(ownershipUsage(decks, settings.sideDecks)), shortages: withoutImages(ownershipShortages(cards, decks)) };
    case 'events_list': return library.getEvents();
    case 'statistics_get': {
      const unit = args.unit || 'match';
      const events = filterEvents(library.getEvents(), { ...args.filters, unit }), rows = events.flatMap(event => event.matched);
      return { unit, events, totals: summarize(rows), winRate: winRate(rows), daily: dailyResults(rows, args.filters), groups: args.group ? groupRecords(rows, args.group) : [] };
    }
    case 'deck_export': return { files: await Promise.all((await deckFiles(findDeck(args.deckId), args.format, settings, cards)).map(async file => ({ name: file.name, dataUrl: await blobData(file.blob) }))) };
    case 'backup_export': return { files: [{ name: `tcg-backup-${new Date().toISOString().slice(0, 10)}.json`, dataUrl: await blobData(new Blob([JSON.stringify(await library.exportLibrary(imageData))], { type: 'application/json' })) }] };
    case 'ui_get': return getUI()?.get() || fail('NOT_READY', '画面の準備中です。');
    case 'ui_inspect': return inspectScreen();
    case 'ui_act': return actOnScreen(args);
    case 'ui_set': {
      if (!getUI()) fail('NOT_READY', '画面の準備中です。');
      if (getUI().busy()) fail('EDIT_IN_PROGRESS', '画面の編集を終了してください。');
      if (args.cardId) findCard(args.cardId);
      if (args.deckId) findDeck(args.deckId);
      getUI().set(args); return { applied: true };
    }
    default: fail('UNKNOWN_OPERATION', '対応していない操作です。');
  }
}
