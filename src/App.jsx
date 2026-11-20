import DeckZoneButtons from './components/DeckZoneButtons.jsx';
import { useDraft, updateDraft } from './local/store.js';
import { changeDraftCount, clearDraft } from './local/draft.js';
import { prepareDraftSave, draftForDeck } from './local/deckActions.js';
import { attachUI } from './automation/integration.js';
import { nativeHost } from './local/nativeHost.js';
import { saveNativeBlob } from './local/nativeFiles.js';
import { deckFiles } from './local/outputFiles.js';
import OwnershipSummary from './components/OwnershipSummary.jsx';
import { useOwnershipEditor } from './local/useOwnershipEditor.js';
import { matchesOwnership, ownershipUsage, ownedValue } from './local/ownership.js';
import './styles/ownership.css';
import { allDeckCards, sidesOf, minimalCards as minimizeCards, LEGACY_SIDE_ID, sideCountLabel } from './local/sideDecks.js';
import { LocalControls, LocalFilters } from './local/Controls.jsx';
import Home from './analysis/Home.jsx';
import Analysis from './analysis/Analysis.jsx';
import { useLocal, useSavedDecks, commitSavedDecks, getLocalLimit, matchesLocalCard, getLocalSettings, getLocalCards, useCardViewMode, setCardViewMode, applySettings, keysOf } from './local/store.js';
import { buildDeckSVG } from './local/deckSvg.js';
import { buildPrintPdfs } from './local/exports.js';
import { makeDeckJson, prepareDeckImport } from './local/deckJson.js';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';
import './CardList.css';
import './styles/builder-layout.css';
import './analysis/analysis.css';
import { FixedSizeList, FixedSizeGrid } from 'react-window';
import CardDetailModal from './components/CardDetailModal';
import ExportFilesModal from './components/ExportFilesModal';
import { sortDeckCards, rehydrateCards as rehydrateSavedCards } from './utils/deckUtils';
import { packTitle as getPackTitle, packKey, cardPack } from './utils/deckPacks';
import { sortSavedDecks, withDeckSaveTimes } from './utils/savedDeckSort';
import SavedDeckSort from './components/SavedDeckSort';
import SavedDeckFilters from './components/SavedDeckFilters';
import { EMPTY_DECK_FILTERS, profileFromSavedCards, getDeckFilterOptions, matchDeckProfile } from './utils/savedDeckFilters';

// CardDetailModal は ./components/CardDetailModal.jsx から import 済み
// ExportFilesModal は ./components/ExportFilesModal.jsx から import 済み

function isIOSDevice() {
  try {
    const ua = navigator.userAgent || '';
    const iOSByUA = /iPad|iPhone|iPod/.test(ua);
    const iPadOSByPlatform = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return iOSByUA || iPadOSByPlatform;
  } catch {
    return false;
  }
}

const ARCHETYPE_CARD_THRESHOLD = 10;
const DECK_ARCHETYPE_SHARE_THRESHOLD = 0.5;

function getCardArchetypePrints(card) {
  const faces = card?.isDoubleSided && card.front && card.back
    ? [card.front, card.back]
    : [card];
  const prints = [];
  const seenKeys = new Set();

  for (const face of faces) {
    const key = packKey(face?.pack);
    if (!key || seenKeys.has(key)) continue;

    seenKeys.add(key);
    prints.push({
      key,
      pack: face?.pack || card?.pack || key,
    });
  }

  return prints;
}

function getArchetypeName(pack) {
  return getPackTitle(pack);
}

const CardRow = React.memo(function CardRow({ index, style, data }) {
    const { decreaseCardCount, getCardCountInDeck, increaseCardCount, openCardDetail } = data.context;
    const card = data.cards[index];
    if (!card) return null;
    const countInMainDeck = getCardCountInDeck(card.id);
    // ダブルフェイス対応
    const isDoubleSided = card.isDoubleSided && card.front && card.back;
    const displayCard = isDoubleSided ? card.front : card;
    const typeText = isDoubleSided ? `${card.front.type} / ${card.back.type}` : card.type;
    const zoneColor = data.context.zoneColor || '#1976d2';
    const count = countInMainDeck;
    const ownedEditing = data.context.ownedEditing;
    const maxCount = ownedEditing ? Number.MAX_SAFE_INTEGER : getLocalLimit(card);
    return (
      <div
        className="card-item"
        style={{ ...style, '--zone-color': zoneColor, touchAction: 'pan-y', cursor: 'pointer' }}
        key={card.id}
        onClick={e => {
          // +/−ボタン以外のクリックで詳細
          if (
            e.target.classList.contains('plusBtn') ||
            e.target.classList.contains('minusBtn')
          ) return;
          openCardDetail(card);
        }}
      >
        <div className="card-grid-img-wrap" style={{ width: 48, height: 64, marginRight: 8 }}>
          <img src={displayCard.image} alt={displayCard.name} className="card-grid-img" style={{ width: '100%', height: '100%' }} />
        </div>
        <div className="card-info"><b>{card.name}</b> <span style={{ fontSize: '0.9em', color: '#666' }}>({typeText})</span></div>
        {(maxCount > 0 || count > 0) && (
          <div className="card-controls">
            <button
              onClick={e => { e.stopPropagation(); decreaseCardCount(card.id); }}
              className="minusBtn"
              disabled={count <= 0}
              style={{ background: zoneColor }}
            >-</button>
            <span>{ownedEditing ? (count === '' ? '—' : count) : `${count} / ${Number.isFinite(maxCount) ? maxCount : '∞'}`}</span>
            <button
              onClick={e => { e.stopPropagation(); increaseCardCount(card.id); }}
              className="plusBtn"
              disabled={count >= maxCount}
              style={{ background: zoneColor }}
            >+</button>
          </div>
        )}
      </div>
    );
  });

const CardGridCell = React.memo(function CardGridCell({ columnIndex, rowIndex, style, data }) {
    const { decreaseCardCount, getCardCountInDeck, increaseCardCount, openCardDetail } = data.context;
    const { cards, columns } = data;
    const index = rowIndex * columns + columnIndex;
    if (index >= cards.length) return null;
    const card = cards[index];
    const countInMainDeck = getCardCountInDeck(card.id);
    const isDoubleSided = card.isDoubleSided && card.front && card.back;
    const displayCard = isDoubleSided ? card.front : card;
    const zoneColor = data.context.zoneColor || '#1976d2';
    const count = countInMainDeck;
    const ownedEditing = data.context.ownedEditing;
    const maxCount = ownedEditing ? Number.MAX_SAFE_INTEGER : getLocalLimit(card);
    return (
      <div
        style={{ ...style, '--zone-color': zoneColor, padding: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'center', touchAction: 'pan-y', cursor: 'pointer' }}
        onClick={e => {
          // +/−ボタン以外のクリックで詳細
          if (
            e.target.classList.contains('plusBtn') ||
            e.target.classList.contains('minusBtn')
          ) return;
          openCardDetail(card);
        }}
      >
        <div
          className="card-grid-img-wrap"
          style={{
            width: '100%',
            height: '100%',
            aspectRatio: '385/561',
            background: '#fff',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 5,
            boxShadow: '0 1px 4px #bbb',
            overflow: 'hidden',
          }}
        >
          <img
            src={displayCard.image}
            alt={displayCard.name}
            className="card-grid-img"
            style={{
              width: '98%',
              height: '98%',
              aspectRatio: '385/561',
              objectFit: 'cover',
              borderRadius: 5,
              background: '#fff',
              boxShadow: 'none',
              cursor: 'pointer',
              display: 'block',
            }}
          />
          {(ownedEditing || count > 0) && (
            <span
              className="card-badge"
              style={{ position: 'absolute', top: 0, right: 0, background: zoneColor, color: '#fff', borderRadius: '50%', width: '1.7em', height: '1.7em', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1em', fontWeight: 'bold', boxShadow: '0 1px 4px #bbb', zIndex: 3, pointerEvents: 'none' }}
             aria-label={ownedEditing ? `所持枚数：${count === '' ? '未入力' : count + '枚'}` : undefined}>{count === '' ? '—' : count}</span>
          )}
          {(maxCount > 0 || count > 0) && (
            <div
              className="card-grid-controls"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 4,
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '0.3em',
                zIndex: 2,
              }}
            >
              <button
                className="minusBtn"
                style={{
                  width: '2em',
                  height: '2em',
                  borderRadius: '50%',
                  background: '#fff',
                  border: `2px solid ${zoneColor}`,
                  color: zoneColor,
                  fontSize: '1.2em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 4px #bbb',
                  cursor: 'pointer',
                }}
                onClick={e => {
                  e.stopPropagation();
                  decreaseCardCount(card.id);
                }}
                disabled={count <= 0}
              >
                -
              </button>
              <button
                className="plusBtn"
                style={{
                  width: '2em',
                  height: '2em',
                  borderRadius: '50%',
                  background: zoneColor,
                  border: `2px solid ${zoneColor}`,
                  color: '#fff',
                  fontSize: '1.2em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 4px #bbb',
                  cursor: 'pointer',
                }}
                onClick={e => {
                  e.stopPropagation();
                  increaseCardCount(card.id);
                }}
                disabled={count >= maxCount}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    );
  });

export default function CanvasCardApp() {
  const { gameId } = useLocal();
  return <DeckApp key={gameId} />;
}

function DeckApp() {
  const { cards: cardData, gameId, settings } = useLocal();
  const ownership = useOwnershipEditor(cardData, gameId);
  const [ownershipFilter, setOwnershipFilter] = useState('');
  const initialDraft = useDraft(gameId);
  const draftSetter = React.useCallback((key, value) => updateDraft(gameId, previous => ({ [key]: typeof value === 'function' ? value(previous[key] ?? (key === 'sideDecks' ? {} : [])) : value })), [gameId]);
  const [fieldFilters, setFieldFilters] = useState({});
  const [search, setSearch] = useState('');
  // --- 最新カードデータへの再結合（リハイドレート）ヘルパー ---
  const cardMapById = useMemo(() => {
    const m = new Map();
    for (const c of cardData) m.set(c.id, c);
    return m;
  }, [cardData]);
  const rehydrateCards = (cards = []) => rehydrateSavedCards(cards, cardMapById);
  const deckEntries = useMemo(() => initialDraft.deck || [], [initialDraft]);
  const setDeck = React.useCallback(value => draftSetter('deck', value), [draftSetter]);
  const deck = useMemo(() => rehydrateSavedCards(deckEntries, cardMapById), [deckEntries, cardMapById]);
  const sideDecks = useMemo(() => sidesOf(initialDraft), [initialDraft]);
  const setSideDecks = React.useCallback(value => draftSetter('sideDecks', value), [draftSetter]);
  const [selectedZone, setSelectedZone] = useState('main');
  const zones = useMemo(() => [{ id: 'main', name: 'メインデッキ', color: '#1976d2' }, ...(settings.sideDecks || [])], [settings.sideDecks]);
  useEffect(() => {
    const allowed = new Set(zones.map(zone => zone.id));
    setSelectedZone(previous => allowed.has(previous) ? previous : 'main');
  }, [zones]);
  const deckThumbnailCardId = initialDraft.deckThumbnailCardId ?? null;
  const setDeckThumbnailCardId = value => draftSetter('deckThumbnailCardId', value);
  const [exportFilesModal, setExportFilesModal] = useState(null);

  const savedDecks = useSavedDecks(gameId);
  const [savingDeck, setSavingDeck] = useState(false);
  const saveDecks = async update => {
    setSavingDeck(true);
    try { await commitSavedDecks(gameId, update); }
    finally { setSavingDeck(false); }
  };

  const deckName = initialDraft.deckName || '';
  const setDeckName = value => draftSetter('deckName', value);
  const [activeTab, setActiveTab] = useState('home');
  const currentDeckName = initialDraft.currentDeckName || '';
  const setCurrentDeckName = value => draftSetter('currentDeckName', value);
  const [showFront, setShowFront] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [filterPack, setFilterPack] = useState('');
  const viewMode = useCardViewMode();
  const setViewMode = setCardViewMode;
  const [savedDeckSearch, setSavedDeckSearch] = useState('');
  const [savedDeckSortKey, setSavedDeckSortKey] = useState('hit');
  const [savedDeckSortDirection, setSavedDeckSortDirection] = useState('desc');
  const [showSavedDeckOptions, setShowSavedDeckOptions] = useState(false);
  const [savedDeckFilters, setSavedDeckFilters] = useState(EMPTY_DECK_FILTERS);
  useEffect(() => {
    setSavedDeckFilters(previous => ({ ...previous, ...Object.fromEntries(['type', 'color', 'tribe'].filter(key => !keysOf(settings).includes(key)).map(key => [key, ''])) }));
  }, [settings]);
  const [showDeckInfoModal, setShowDeckInfoModal] = useState(false);
  const tabOrder = useMemo(() => ['home', 'search', 'deck', 'saved', 'analysis'], []);
  const tabContentWrapRef = useRef(null);

  const listContainerRef = useRef(null);
  // 旧PNGキャプチャは削除。SVGベース出力のみ使用。

  const closeExportFilesModal = () => {
    try {
      const files = exportFilesModal?.files;
      if (Array.isArray(files)) {
        for (const f of files) {
          if (f?.url) URL.revokeObjectURL(f.url);
        }
      }
    } catch {
      // ignore
    }
    setExportFilesModal(null);
  };

  const openExportFilesModal = (title, files) => {
    setExportFilesModal({ title, files });
  };

  const resetFilters = () => {
    setFieldFilters({});
    setSearch('');
    setFilterPack('');
    setOwnershipFilter('');
    // 系統のドロップダウンも閉じる
  };

  const deckInfo = useMemo(() => {
    const archetypeCandidates = new Map();
    for (const card of cardData) {
      for (const print of getCardArchetypePrints(card)) {
        if (!archetypeCandidates.has(print.key)) {
          archetypeCandidates.set(print.key, { key: print.key, pack: print.pack, cardIds: new Set() });
        }

        const candidate = archetypeCandidates.get(print.key);
        if ((!candidate.pack || candidate.pack === candidate.key) && print.pack) {
          candidate.pack = print.pack;
        }
        candidate.cardIds.add(Number(card.id));
      }
    }

    const archetypes = [...archetypeCandidates.values()]
      .filter(candidate => candidate.cardIds.size >= ARCHETYPE_CARD_THRESHOLD)
      .map(candidate => ({
        key: candidate.key,
        pack: candidate.pack,
        packTitle: getPackTitle(candidate.pack),
        name: getArchetypeName(candidate.pack),
        cardTypeCount: candidate.cardIds.size,
      }));
    const eligibleKeys = new Set(archetypes.map(archetype => archetype.key));

    const coveredKeys = new Set();
    for (const saved of savedDecks) {
      const deckPackCounts = new Map();
      let deckTotal = 0;
      const addCardToDeckCounts = (card, count) => {
        if (!card || count <= 0) return;
        deckTotal += count;
        for (const print of getCardArchetypePrints(card)) {
          deckPackCounts.set(print.key, (deckPackCounts.get(print.key) || 0) + count);
        }
      };

      for (const savedCard of saved.cards || []) {
        const count = Number(savedCard?.count) || 0;
        if (count <= 0) continue;

        const id = Number(savedCard?.id);
        if (!Number.isFinite(id)) continue;

        const card = cardMapById.get(id) || savedCard;
        addCardToDeckCounts(card, count);
      }

      for (const entry of Object.values(sidesOf(saved)).flat()) addCardToDeckCounts(cardMapById.get(entry.id), entry.count);

      if (deckTotal <= 0 || deckPackCounts.size === 0) continue;

      const [mainKey, mainCount] = [...deckPackCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0];
      if (
        eligibleKeys.has(mainKey) &&
        mainCount / deckTotal >= DECK_ARCHETYPE_SHARE_THRESHOLD
      ) {
        coveredKeys.add(mainKey);
      }
    }

    const coveredArchetypes = archetypes.filter(archetype => coveredKeys.has(archetype.key));
    const missingArchetypes = archetypes.filter(archetype => !coveredKeys.has(archetype.key));

    return {
      totalDecks: savedDecks.length,
      totalArchetypes: archetypes.length,
      coveredArchetypes,
      missingArchetypes,
    };
  }, [cardMapById, savedDecks, cardData]);

  const increaseCardCount = React.useCallback(cardId => changeDraftCount(gameId, 'main', cardId, 1), [gameId]);
  const decreaseCardCount = React.useCallback(cardId => changeDraftCount(gameId, 'main', cardId, -1), [gameId]);

  const usage = useMemo(() => ownershipUsage(savedDecks, settings.sideDecks), [savedDecks, settings.sideDecks]);
  const filteredCards = useMemo(() => ownership.previewCards.filter(card => matchesLocalCard(card, search, fieldFilters, filterPack) && matchesOwnership(card.ownedCount, ownershipFilter, usage.get(card.id)?.total)), [ownership.previewCards, ownershipFilter, usage, fieldFilters, filterPack, search]);

  const savedDeckProfiles = useMemo(() => new Map(savedDecks.map(saved =>
    [saved, profileFromSavedCards((saved.cards || []).map(item => ({ ...(cardMapById.get(item.id) || item), count: item.count })))]
  )), [savedDecks, cardMapById]);
  const savedDeckFilterOptions = useMemo(() => getDeckFilterOptions([...savedDeckProfiles.values()]), [savedDeckProfiles]);
  const savedDeckMatches = useMemo(() => new Map(savedDecks.map(saved =>
    [saved, matchDeckProfile(savedDeckProfiles.get(saved), savedDeckFilters)]
  )), [savedDecks, savedDeckProfiles, savedDeckFilters]);
  const filteredSavedDecks = useMemo(() => {
    const keyword = savedDeckSearch.trim().toLowerCase();
    const filtered = savedDecks.filter(saved => String(saved.name || '').toLowerCase().includes(keyword) && savedDeckMatches.get(saved).matches);
    return sortSavedDecks(filtered, savedDeckSortKey, savedDeckSortDirection, saved =>
      rehydrateSavedCards(saved.cards || [], cardMapById).map(card => ({
        pack: cardPack(card),
        count: card.count,
      })), saved => savedDeckMatches.get(saved).score
    );
  }, [savedDecks, savedDeckSearch, savedDeckSortKey, savedDeckSortDirection, savedDeckMatches, cardMapById]);

  const deckCounts = useMemo(() => new Map(deck.map(card => [card.id, card.count])), [deck]);
  const getCardCountInDeck = React.useCallback(cardId => deckCounts.get(cardId) || 0, [deckCounts]);

  const countOf = React.useCallback((zone, id) => zone === 'main' ? getCardCountInDeck(id) : (sideDecks[zone] || []).find(card => card.id === id)?.count || 0, [getCardCountInDeck, sideDecks]);
  const changeZoneCount = React.useCallback((zone, id, delta) => {
    changeDraftCount(gameId, zone, id, delta);
  }, [gameId]);

  const saveCurrentDeck = async () => {
    let prepared;
    try { prepared = prepareDraftSave(initialDraft, savedDecks); }
    catch (error) { alert(error.message); return; }
    if (prepared.overwrite && !window.confirm(`デッキ「${deckName}」を上書きしますか？`)) return;
    try { await saveDecks(prepared.decks); }
    catch { alert('デッキを保存できませんでした。空き容量を確認して、もう一度保存してください。'); return; }
    updateDraft(gameId, { currentDeckName: deckName, deckName: '' });
    alert(`デッキ「${deckName}」を${prepared.overwrite ? '上書き保存' : '保存'}しました。`);
  };
  const loadDeck = name => {
    const selectedDeck = savedDecks.find(deck => deck.name === name);
    if (!selectedDeck) return;
    updateDraft(gameId, draftForDeck(selectedDeck));
    setActiveTab('deck');
  };
  const createNewDeck = () => { clearDraft(gameId); setActiveTab('deck'); };
  const deleteDeckByName = async (name) => {
    // 上書き前に確認
    const confirmDelete = window.confirm(`デッキ「${name}」を削除しますか？`);
    if (!confirmDelete) return;
    const updatedDecks = savedDecks.filter((deck) => deck.name !== name);
    try { await saveDecks(updatedDecks); } catch { alert('デッキを削除できませんでした。空き容量を確認して、もう一度削除してください。'); return; }
    if (name === currentDeckName) {
      setCurrentDeckName('');
      setDeckName('');
      setDeck([]);
      setSideDecks({});
      setDeckThumbnailCardId(null);
    }
    alert(`デッキ「${name}」を削除しました。`);
    if (updatedDecks.length > 0) {
      setActiveTab('saved');
    } else {
      setActiveTab('deck');
    }
  };

  // グリッド1セルの高さ（react-window用）
  const CARD_GRID_HEIGHT = 160; // 例: 160px 固定（必要に応じて調整）

  // react-window用: カードリスト1行


  // react-window用: グリッド1セル


  // 横長ではカード表示領域を測定し、縦長では従来の寸法を維持する。
  const searchCardsRef = useRef(null);
  const deckCardsRef = useRef(null);
  const [isLandscape, setIsLandscape] = useState(() => window.matchMedia('(orientation: landscape)').matches);
  const [gridScrollbarWidth, setGridScrollbarWidth] = useState(0);
  const [listSize, setListSize] = useState({ width: Math.max(window.innerWidth, 320), height: 600 });
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:100px;height:100px;overflow:scroll;';
    document.body.appendChild(probe);
    setGridScrollbarWidth(probe.offsetWidth - probe.clientWidth);
    probe.remove();
  }, []);
  useEffect(() => {
    const pane = activeTab === 'deck' ? deckCardsRef.current : searchCardsRef.current;
    const measure = () => {
      const landscape = window.matchMedia('(orientation: landscape)').matches;
      setIsLandscape(landscape);
      const width = landscape && pane?.clientWidth ? pane.clientWidth : Math.max(window.innerWidth, 320);
      const height = landscape && pane?.clientHeight ? pane.clientHeight : 600;
      setListSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    const observer = new ResizeObserver(measure);
    if (pane) observer.observe(pane);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeTab, ownership.active]);

  // All tabs share one gesture boundary, including virtualized card rows.
  useEffect(() => {
    const el = tabContentWrapRef.current;
    if (!el) return;
    let start = null;
    const reset = () => { start = null; };
    const handleStart = event => {
      if (event.touches.length !== 1 || event.target.closest('dialog, [role="dialog"], .modal-overlay, input, textarea, select')) { reset(); return; }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
    };
    const handleEnd = event => {
      const origin = start;
      reset();
      const touch = [...event.changedTouches].find(touch => touch.identifier === origin?.id);
      if (!origin || !touch) return;
      const dx = touch.clientX - origin.x, dy = touch.clientY - origin.y;
      if (Math.abs(dx) <= 50 || Math.abs(dx) <= Math.abs(dy)) return;
      const next = tabOrder[tabOrder.indexOf(activeTab) + (dx < 0 ? 1 : -1)];
      if (next) setActiveTab(next);
    };
    el.addEventListener('touchstart', handleStart, { passive: true });
    el.addEventListener('touchend', handleEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleStart);
      el.removeEventListener('touchend', handleEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [activeTab, tabOrder]);

  // グリッド用カラム数・カラム幅・高さ（カード画像サイズに合わせる）
  const gridColumns = isLandscape ? 5 : 4;
  const gridColWidth = Math.max(Math.floor((listSize.width - (isLandscape ? gridScrollbarWidth : 0)) / gridColumns), 1);
  // カード画像のアスペクト比3:4、幅はグリッド幅の92%を画像に使う
  const gridImgWidth = Math.floor(gridColWidth * 0.92);
  const gridImgHeight = Math.floor(gridImgWidth * 561 / 385);
  // セルの高さは画像サイズ＋余白（上下4%ずつ）
  const gridRowHeight = Math.floor(gridImgHeight / 0.92);

  // カード詳細モーダル
  // カード詳細モーダル表示用state
  const [detailCard, setDetailCard] = useState(null);
  const [detailHideDeckActions, setDetailHideDeckActions] = useState(false);

  // カード詳細を開く
  const openCardDetail = React.useCallback((card, opts = {}) => {
    setDetailCard(card);
    setDetailHideDeckActions(!!opts.hideDeckActions);
    setShowFront(true); // 新しく開くたびに表面にリセット
  }, [setDetailCard, setDetailHideDeckActions, setShowFront]);
  // カード詳細を閉じる
  const closeCardDetail = () => {
    setDetailCard(null);
    setDetailHideDeckActions(false);
  };

  // スクロール位置保存用
  const searchListScrollRef = useRef(0);

  // 検索タブのリスト/グリッドのスクロール位置を保存
  useEffect(() => {
    if (activeTab !== 'search') {
      // タブを離れるときに現在のスクロール位置を保存
      const el = listContainerRef.current;
      if (el) {
        searchListScrollRef.current = el.scrollTop;
      }
    }
  }, [activeTab]);

  // 検索タブに戻ったときにスクロール位置を復元
  useEffect(() => {
    if (activeTab === 'search') {
      const el = listContainerRef.current;
      if (el) {
        setTimeout(() => {
          el.scrollTop = searchListScrollRef.current;
        }, 0);
      }
    }
  }, [activeTab, viewMode, listSize.width, listSize.height]);

  // デッキ詳細ウィンドウ用state
  const [detailDeckName, setDetailDeckName] = useState(null);
  const detailDeck = savedDecks.find(saved => saved.name === detailDeckName);

  useEffect(() => attachUI({
    busy: () => ownership.active || savingDeck || !!document.querySelector('dialog[open], .mock-card-editor'),
    get: () => ({ activeTab, viewMode, search, selectedZone, detailCardId: detailCard?.id ?? null, detailDeckName, ownershipEditing: ownership.active }),
    set: args => {
      if (args.tab) setActiveTab(args.tab);
      if (args.viewMode) setCardViewMode(args.viewMode);
      if (Object.hasOwn(args, 'search')) setSearch(args.search);
      if (args.cardId) openCardDetail(cardData.find(card => card.id === args.cardId));
      if (args.deckId) setDetailDeckName(savedDecks.find(deck => deck.id === args.deckId)?.name ?? null);
      if (args.closeDetails) { setDetailCard(null); setDetailDeckName(null); }
    },
  }), [ownership.active, savingDeck, activeTab, viewMode, search, selectedZone, detailCard, detailDeckName, cardData, savedDecks, openCardDetail]);


  async function exportNativeDeck(deck, format) {
    try {
      const files = await deckFiles(deck, format, settings, cardData);
      if (files.length === 1) await saveNativeBlob(files[0].blob, files[0].name);
      else openExportFilesModal('ファイルを保存', files.map(file => ({ name: file.name, url: URL.createObjectURL(file.blob) })));
    } catch (error) { alert(`出力できませんでした。${error.message || error}`); }
  }
  async function exportDeckToA4PDF(deck) {
    if (nativeHost()) return exportNativeDeck(deck, 'pdf');
    try {
      const current = { ...deck, cards: rehydrateSavedCards(allDeckCards(deck), cardMapById) };
      const files = await buildPrintPdfs(current, getLocalSettings().cardSize);
      if (isIOSDevice() || files.length > 1) {
        openExportFilesModal('PDFを保存', files.map(file => ({ name: file.name, url: URL.createObjectURL(file.doc.output('blob')) })));
      } else {
        for (const file of files) file.doc.save(file.name);
        alert('PDFを作成しました。印刷は「実際のサイズ」か「100%」を選んでください。');
      }
    } catch (error) { alert(error.message || 'PDFを作成できませんでした。'); }
  }

  // デッキ詳細画面でデッキをJSONでエクスポート
  const exportSingleDeckAsJson = (deck) => {
    if (nativeHost()) return exportNativeDeck(deck, 'json');
    const dataStr = JSON.stringify(makeDeckJson(deck, getLocalSettings(), getLocalCards()), null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.name || "deck"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // sortDeckCards は ./utils/deckUtils.js から import 済み

  // --- SVGエクスポート（ダウンロード）---
  const exportDeckAsSVG = async (deckObj) => {
    if (nativeHost()) return exportNativeDeck(deckObj, 'svg');
    const built = await buildDeckSVG(deckObj, settings, cardMapById).catch(error => { alert(error.message); return null; });
    if (!built) return;
    const blob = new Blob([built.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckObj.name || 'deck'}-detail.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- SVG→PNG 変換してダウンロード ---
  const exportDeckSvgToPng = async (deckObj, opts = {}) => {
    if (nativeHost()) return exportNativeDeck(deckObj, 'png');
    const built = await buildDeckSVG(deckObj, settings, cardMapById).catch(error => { alert(error.message); return null; });
    if (!built) return;
    const { svg, width, height } = built;
    // 高解像度化用スケール。指定がなければデバイスのDPRか2倍を採用。
    const scale = Math.max(4, Math.floor((opts.scale || window.devicePixelRatio || 4)));
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
        img.src = svgUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      // スケール適用のうえアンチエイリアスを有効化
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const iOSMode = isIOSDevice();
      const fileName = `${deckObj.name || 'deck'}.png`;

      if (iOSMode) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const url = URL.createObjectURL(blob);
          openExportFilesModal('PNGを保存', [{ name: fileName, url }]);
        } else {
          openExportFilesModal('PNGを保存', []);
        }
      } else {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  // 安全な幅・高さを保証
  const safeListWidth = (!listSize.width || isNaN(listSize.width) || listSize.width < 80) ? 320 : listSize.width;
  const safeGridColWidth = (!gridColWidth || isNaN(gridColWidth) || gridColWidth < 1) ? 80 : gridColWidth;
  const safeListHeight = (!listSize.height || isNaN(listSize.height) || listSize.height < 1) ? 600 : listSize.height;

  const renderContext = useMemo(() => ({ decreaseCardCount, getCardCountInDeck, increaseCardCount, openCardDetail }), [decreaseCardCount, getCardCountInDeck, increaseCardCount, openCardDetail]);
  const searchContext = useMemo(() => ({ ...renderContext, zoneColor: zones.find(zone => zone.id === selectedZone)?.color, increaseCardCount: id => changeZoneCount(selectedZone, id, 1), decreaseCardCount: id => changeZoneCount(selectedZone, id, -1), getCardCountInDeck: id => countOf(selectedZone, id) }), [renderContext, selectedZone, changeZoneCount, countOf, zones]);
  const { getCount: getOwnedCount, changeCount: changeOwnedCount } = ownership;
  const ownedContext = useMemo(() => ({ ...renderContext, ownedEditing: true, zoneColor: '#1976d2', getCardCountInDeck: getOwnedCount, increaseCardCount: id => changeOwnedCount(id, 1), decreaseCardCount: id => changeOwnedCount(id, -1) }), [renderContext, getOwnedCount, changeOwnedCount]);
  const searchItemData = useMemo(() => ({ cards: filteredCards, columns: gridColumns, context: ownership.active ? ownedContext : searchContext }), [filteredCards, gridColumns, ownership.active, ownedContext, searchContext]);
  const zoneGroups = zones.map(zone => ({ ...zone, cards: sortDeckCards(zone.id === 'main' ? deck : rehydrateCards(sideDecks[zone.id] || [])) }));

  const displayGroups = ownership.active ? [{ id: 'owned', cards: ownership.previewCards.filter(card => Number(card.ownedCount) > 0 || ownedValue(card.ownedCount) !== ownership.original[card.id]) }] : zoneGroups;

  // 画面幅が異常な場合はメッセージ表示
  if (!safeListWidth || isNaN(safeListWidth) || safeListWidth < 80) {
    return <div style={{padding:40}}>画面を表示できません。ウィンドウを広げてください。</div>;
  }

  const deckFooter = (
            <div className="builder-footer">
            <div className="input-row">
              <input
                id="deckNameInput"
                placeholder="デッキ名"
                type="text"
                value={deckName}
                disabled={savingDeck}
                onChange={e => setDeckName(e.target.value)}
              />
            </div>
            <div className="input-row" style={{ gap: '0.5em' }}>
              <button id="saveDeckBtn" disabled={savingDeck} style={{ flex: 1, background: '#388e3c' }} onClick={saveCurrentDeck}>{isLandscape ? '保存' : 'デッキ保存'}</button>

            </div>
            <button id="clearDeckBtn" style={{ flex: 1, background: '#bbb', color: '#222', marginTop: '0.5em' }} onClick={createNewDeck}>クリア</button>
            <div id="message"></div>
            </div>
  );

  return (
    <div inert={ownership.saving || savingDeck ? true : undefined} className={`container${ownership.active ? ' ownership-active' : ''}${activeTab !== 'home' ? ' workspace-active' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h1 style={{ margin: 0 }}>　TCG マネージャー　</h1>
        <LocalControls disabled={ownership.active} onSettingsChange={resetFilters} onDataChange={() => { resetFilters(); setActiveTab("search"); }} />
      </div>
      {/* タブバー */}
      <div className="tab-bar" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr) minmax(0,2fr) minmax(0,2fr) minmax(0,1fr)', gap: '6px', overflowX: 'hidden' }}>
        <button className={`tab-btn${activeTab === 'home' ? ' active' : ''}`} style={{ minWidth: 0, fontSize: '1em', fontWeight: 'bold', lineHeight: 1 }} onClick={() => setActiveTab('home')}>🏠</button>
        <button className={`tab-btn${activeTab === 'search' ? ' active' : ''}`} style={{ minWidth: 0 }} onClick={() => setActiveTab('search')}>カード検索</button>
        <button className={`tab-btn${activeTab === 'deck' ? ' active' : ''}`} style={{ minWidth: 0 }} onClick={() => setActiveTab('deck')}>{ownership.active ? '所持カード' : '作成中デッキ'}</button>
        <button className={`tab-btn${activeTab === 'saved' ? ' active' : ''}`} style={{ minWidth: 0 }} onClick={() => setActiveTab('saved')}>保存デッキ</button>
        <button className={`tab-btn${activeTab === 'analysis' ? ' active' : ''}`} style={{ minWidth: 0 }} onClick={() => setActiveTab('analysis')}>分析</button>
      </div>
      {ownership.active && <div className="ownership-mode-bar" role="region" aria-label="所持枚数編集モード"><div className="ownership-mode-actions"><strong>{ownership.saving ? '保存中…' : '所持枚数を閲覧・編集中'}</strong><span><button type="button" className="ownership-secondary" disabled={ownership.saving} onClick={ownership.cancel}>キャンセル</button><button type="button" disabled={ownership.saving} onClick={ownership.complete}>完了</button></span></div>{ownership.error && <p role="alert">{ownership.error}</p>}</div>}
      <div
        className="tab-content-wrap"
        ref={tabContentWrapRef}
        style={{ touchAction: 'pan-y' }} // 垂直スクロールは許可
      >
        {/* ホームタブ */}
        <div className="tab-content" style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
          <Home ownershipEditor={ownership} savedDecks={savedDecks} viewMode={viewMode} setViewMode={setViewMode} onCardClick={openCardDetail} onBeforeSwitch={() => {}} />
        </div>
        <div className="tab-content tab-workspace" style={{ display: activeTab === 'analysis' ? undefined : 'none' }}><Analysis savedDecks={savedDecks} isLandscape={isLandscape} /></div>
        {/* カード検索タブ */}
        <div className="tab-content builder-workspace" style={{ display: activeTab === 'search' ? undefined : 'none' }}>
          <div className="builder-controls">
          <div className="input-row">
            <input
              type="text"
              placeholder="カード名、項目、テキストで検索"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button onClick={() => {}} style={{ minWidth: '4em' }}>検索</button>
          </div>
          {/* 検索結果件数表示 */}
          <div className="ownership-results-heading">
            <span style={{ fontWeight: 'bold' }}>検索結果</span>
            <div className="ownership-results-actions"><span>{filteredCards.length} 件</span>{!ownership.active && <button type="button" onClick={ownership.begin}>所持枚数を閲覧・編集</button>}</div>
          </div>
          {/* ▼▼▼ フィルターUI（サンプルHTML準拠） ▼▼▼ */}
          <div style={{ margin: '0.7em 0 0.7em 0' }}>
            <div style={{ display: 'flex', gap: '0.7em', marginBottom: '0.7em' }}>
              <button onClick={() => setShowFilter(f => !f)} style={{ flex: 1 }}>
                {showFilter ? (isLandscape ? '閉じる' : 'フィルターを閉じる') : (isLandscape ? 'フィルター' : 'フィルターを開く')}
              </button>
              <button onClick={resetFilters} style={{ flex: 1, background: '#d32f2f', color: '#fff' }}>{isLandscape ? 'リセット' : '条件リセット'}</button>
            </div>
            {showFilter && (
              <LocalFilters ownershipFilter={ownershipFilter} setOwnershipFilter={setOwnershipFilter} cards={cardData} values={fieldFilters} setValues={setFieldFilters} pack={filterPack} setPack={setFilterPack} />
            )}
          </div>
          {/* ▲▲▲ フィルターUIここまで ▲▲▲ */}
          <div className="view-toggle-row search-view-toggle">
            {!ownership.active && zones.length > 1 && <DeckZoneButtons zones={zones} selected={selectedZone} onSelect={setSelectedZone} />}
            <button className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}>≡</button>
            <button className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')}>■</button>
          </div>
          </div>
          <div className="builder-cards" ref={searchCardsRef}>
          {/* カードリスト（リスト/グリッド切替） */}
          {viewMode === 'list' ? (
            <div
              className="card-list"
              ref={listContainerRef}
              style={{ width: '100%', maxWidth: '100vw', touchAction: 'pan-y' }}
            >
              <FixedSizeList
                height={safeListHeight}
                itemCount={filteredCards.length}
                itemData={searchItemData}
                itemSize={80}
                               width={safeListWidth}
              >
                {CardRow}
              </FixedSizeList>
            </div>
          ) : (
            <div
              className="card-grid"
              ref={listContainerRef}
              style={{ width: '100%', maxWidth: '100vw', touchAction: 'pan-y' }}
            >
              <FixedSizeGrid
                height={safeListHeight}
                columnCount={gridColumns}
                columnWidth={safeGridColWidth}
                rowCount={Math.ceil(filteredCards.length / gridColumns)}
                rowHeight={gridRowHeight}
                width={safeListWidth}
                itemData={searchItemData}
              >
                {CardGridCell}
              </FixedSizeGrid>
            </div>
          )}
          </div>
        </div>
        {/* 作成中デッキタブ */}
        <div className="tab-content" style={{ display: activeTab === 'deck' ? 'block' : 'none' }}>
          <div className="builder-workspace builder-workspace-deck" style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}>
            <div className="builder-controls">
            {ownership.active ? <OwnershipSummary editor={ownership} savedDecks={savedDecks} onCardClick={openCardDetail} /> : <>
            <h2>作成中デッキ</h2>
            {/* サムネイル画像表示 */}
            {(() => {
              const allCards = [...deck, ...Object.values(sideDecks).flat()];
              if (!allCards.length) return null;
              const thumbId = allCards.some(card => card.id === deckThumbnailCardId) ? deckThumbnailCardId : allCards[0].id;
              const thumbCard = cardMapById.get(thumbId);

              return (
              <div className="builder-deck-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5em' }}>
                {(() => {
                  // サムネイル指定カードを取得
                  if (!thumbCard) return null;
                  const isDoubleSided = thumbCard.isDoubleSided && thumbCard.front && thumbCard.back;
                  const displayCard = isDoubleSided ? thumbCard.front : thumbCard;
                  return (
                    <div style={{
                      border: '3px solid #1976d2',
                      borderRadius: 8,
                      padding: 2,
                      marginRight: '0.7em',
                      width: 48,
                      height: 64,
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#fff',
                    }}>
                      <img src={displayCard.image} alt="デッキサムネイル" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
                    </div>
                  );
                })()}
                {/* 合計枚数表示を追加 */}
                <span style={{ fontWeight: 'bold', fontSize: '1.08em', color: '#1976d2', marginRight: '1em' }}>
                  メインデッキ: {deck.reduce((sum, c) => sum + (c.count || 0), 0)}枚
                </span>
                {zoneGroups.slice(1).map(zone => <span key={zone.id} className="deck-zone-heading" style={{ color: zone.color }}>{zone.name}: {zone.cards.reduce((sum, card) => sum + card.count, 0)}枚</span>)}
                <div className="view-toggle-row" style={{ marginBottom: 0 }}>
                  <button className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}>≡</button>
                  <button className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')}>■</button>
                </div>
              </div>
              );
            })()}
              {isLandscape && deckFooter}
            </>}
            </div>
            <div className="builder-cards" ref={deckCardsRef}>
            {ownership.active && <div className="ownership-results-heading"><strong>所持カード</strong><div className="view-toggle-row" style={{ width: 'auto', margin: 0 }}><button className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} aria-label="リスト表示" onClick={() => setViewMode('list')}>≡</button><button className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} aria-label="グリッド表示" onClick={() => setViewMode('grid')}>■</button></div></div>}
            {!displayGroups.some(zone => zone.cards.length) && <div>{ownership.active ? '所持・変更したカードはありません。カード検索で枚数を入力できます。' : 'デッキが空です。'}</div>}
            {displayGroups.filter(zone => zone.cards.length).map(zone => {
              const context = ownership.active ? ownedContext : { ...renderContext, zoneColor: zone.color, getCardCountInDeck: id => countOf(zone.id, id), increaseCardCount: id => changeZoneCount(zone.id, id, 1), decreaseCardCount: id => changeZoneCount(zone.id, id, -1) };
              const data = { cards: zone.cards, columns: gridColumns, context };
              return <section key={zone.id} aria-label={zone.name}>
                {!ownership.active && zone.id !== 'main' && <h3 className="deck-zone-heading" style={{ color: zone.color }}>{zone.name}: {zone.cards.reduce((sum, card) => sum + card.count, 0)}枚</h3>}
                {viewMode === 'list' ? <div className="card-list"><FixedSizeList height={Math.min(zone.cards.length * 80, safeListHeight)} itemCount={zone.cards.length} itemSize={80} width={safeListWidth} itemData={data}>{CardRow}</FixedSizeList></div>
                  : <div className="card-grid"><FixedSizeGrid height={Math.min(Math.ceil(zone.cards.length / gridColumns) * gridRowHeight, safeListHeight)} columnCount={gridColumns} columnWidth={safeGridColWidth} rowCount={Math.ceil(zone.cards.length / gridColumns)} rowHeight={gridRowHeight} width={safeListWidth} itemData={data}>{CardGridCell}</FixedSizeGrid></div>}
              </section>;
            })}
            </div>
            {!ownership.active && !isLandscape && deckFooter}
          </div>
        </div>
        {/* 保存デッキタブ */}
        <div className="tab-content" style={{ display: activeTab === 'saved' ? 'block' : 'none' }}>
          <div className="tab-workspace saved-workspace" style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}>
            <div className="tab-controls">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.7em', flexWrap: 'wrap', marginBottom: '0.7em' }}>
              <h2 style={{ margin: 0 }}>保存デッキ</h2>
              <button
                type="button"
                onClick={() => setShowDeckInfoModal(true)}
                style={{ marginLeft: 'auto', background: '#455a64', color: '#fff', padding: '0.4em 0.7em', fontSize: '0.9em', whiteSpace: 'nowrap' }}
              >
                {isLandscape ? 'デッキの集計' : 'デッキの集計'}
              </button>
            </div>
            <p className="mock-note">デッキJSONを読み込みは、元と同じカードデータ・ゲーム設定が必要です。</p>
            {/* JSONデッキ読込ボタン */}
            <div className="saved-deck-tools">
              <label className="saved-deck-action">
                デッキ読込
                <input disabled={ownership.active} type="file" accept="application/json" style={{ display: 'none' }}
                  onChange={async e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const deck = prepareDeckImport(JSON.parse(text), getLocalSettings(), getLocalCards());
                      if (!deck || !Array.isArray(deck.cards) || !deck.name) {
                        alert('デッキの形式が正しくありません。');
                        return;
                      }

                      const existingDeck = savedDecks.find(d => d.name === deck.name);
                      const normalizedDeck = withDeckSaveTimes({ name: deck.name, cards: minimizeCards(deck.cards), sideDecks: Object.fromEntries(Object.entries(sidesOf(deck)).map(([id, cards]) => [id, minimizeCards(cards)])), tokenDeck: [], thumbnailCardId: deck.thumbnailCardId }, existingDeck);
                      // 既存と同名なら上書き確認
                      const exists = savedDecks.some(d => d.name === normalizedDeck.name);
                      if (exists && !window.confirm(`同名のデッキ「${normalizedDeck.name}」を上書きしますか？`)) return;
                      if (Object.hasOwn(normalizedDeck.sideDecks, LEGACY_SIDE_ID) && !zones.some(zone => zone.id === LEGACY_SIDE_ID)) applySettings({ ...settings, sideDecks: [...(settings.sideDecks || []), { id: LEGACY_SIDE_ID, name: 'トークン' }] });
                      await saveDecks(prev => {
                        return existingDeck
                          ? prev.map(d => d.name === normalizedDeck.name ? normalizedDeck : d)
                          : [...prev, normalizedDeck];
                      });
                      alert(`デッキ「${normalizedDeck.name}」を保存デッキに追加しました。`);
                    } catch (error) {
                      alert(error.message || 'ファイルを読み込めませんでした。');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              <button type="button" className="saved-deck-action" aria-expanded={showSavedDeckOptions} aria-controls="saved-deck-options" onClick={() => setShowSavedDeckOptions(open => !open)}>
                フィルター・並び替え
              </button>
              <input
                type="text"
                aria-label="保存デッキ検索"
                placeholder="デッキ名で検索"
                value={savedDeckSearch}
                onChange={e => setSavedDeckSearch(e.target.value)}
                style={{ flex: '1 1 12em', minWidth: 0 }}
              />
              <button
                type="button"
                className="saved-deck-action"
                onClick={() => { setSavedDeckSearch(''); setSavedDeckFilters(EMPTY_DECK_FILTERS); }}
                disabled={!savedDeckSearch && !Object.values(savedDeckFilters).some(Boolean)}
              >
                条件リセット
              </button>
              {showSavedDeckOptions && (
                <div id="saved-deck-options" className="saved-deck-options-panel">
                  <SavedDeckFilters filters={savedDeckFilters} options={savedDeckFilterOptions} onChange={setSavedDeckFilters}>
                    <SavedDeckSort sortKey={savedDeckSortKey} direction={savedDeckSortDirection} onSortKeyChange={key => { setSavedDeckSortKey(key); if (key === 'hit') setSavedDeckSortDirection('desc'); }} onDirectionChange={setSavedDeckSortDirection} />
                  </SavedDeckFilters>
                </div>
              )}
            </div>
            <div className="view-toggle-row"><button className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}>≡</button><button className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')}>■</button></div>
            <p className="saved-deck-results-count" role="status">全{savedDecks.length}デッキ中 {filteredSavedDecks.length}件</p>
            </div>
            <div className="tab-results">
            <div role="status"></div>
            <div className={`saved-decks-grid${viewMode === 'list' ? ' saved-decks-list' : ''}`}>
              {savedDecks.length === 0 && <div>保存したデッキはありません。</div>}
              {savedDecks.length > 0 && filteredSavedDecks.length === 0 && <div>条件に合うデッキはありません。</div>}
              {filteredSavedDecks.map((saved) => {
                const mainCount = (saved.cards || []).reduce((sum, c) => sum + (c.count || 0), 0);
                return (
                <div className="saved-deck-card" key={saved.name}
                  onClick={e => {
                    // 編集・削除ボタン以外のクリックで詳細ウィンドウ
                    if (
                      e.target.closest('.deck-actions')
                    ) return;
                    // 最新データに再結合した上で詳細を表示
                    setDetailDeckName(saved.name);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ textAlign: 'center', marginBottom: '0.5em' }}>
                    {/* サムネイル画像表示 */}
                    {saved.thumbnail ? (
                      <img src={saved.thumbnail} alt="サムネイル" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '2px solid #1976d2' }} />
                    ) : (
                      (() => {
                        const hydrated = rehydrateCards(saved.cards || []);
                        const thumbFromCards = hydrated.find(c => c.isDeckThumbnail)?.id ?? hydrated[0]?.id ?? null;
                        const thumbFromTokens = Object.values(sidesOf(saved)).flat().find(card => card.count > 0)?.id;
                        const thumbId = (saved.thumbnailCardId ?? null) ?? thumbFromCards ?? (thumbFromTokens ? Number(thumbFromTokens) : null);
                        if (!thumbId) return null;
                        const card = cardMapById.get(Number(thumbId));
                        if (!card) return null;
                        const isDoubleSided = card.isDoubleSided && card.front && card.back;
                        const displayCard = isDoubleSided ? card.front : card;
                        return <img src={displayCard.image} alt="サムネイル" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '2px solid #1976d2' }} />;
                      })()
                    )}
                  </div>
                  <div className="deck-title">{saved.name}</div>
                  <div className="deck-count">メイン{mainCount}枚{zones.slice(1).map(zone => { const total = (sidesOf(saved)[zone.id] || []).reduce((sum, card) => sum + card.count, 0); return total > 0 ? <span key={zone.id} style={{ color: zone.color }}> {sideCountLabel(zone.name)} {total}枚</span> : null; })}</div>
                  <div className="deck-actions">
                    <button disabled={ownership.active} style={{ background: '#1976d2' }} onClick={e => { e.stopPropagation(); loadDeck(saved.name); }}>編集</button>
                    <button disabled={ownership.active} style={{ background: '#d32f2f' }} onClick={e => { e.stopPropagation(); deleteDeckByName(saved.name); }}>削除</button>
                  </div>
                </div>
              );
              })}
            </div>
            </div>
          </div>
        </div>
      </div>

      <ExportFilesModal
        open={!!exportFilesModal}
        title={exportFilesModal?.title}
        files={exportFilesModal?.files}
        onClose={closeExportFilesModal}
      />
      {showDeckInfoModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1em' }}
          onClick={() => setShowDeckInfoModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: '1.2em 1em 1em 1em', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="閉じる"
              style={{ position: 'absolute', top: 8, right: 12, fontSize: '1.3em' }}
              onClick={() => setShowDeckInfoModal(false)}
            >
              ×
            </button>
            <h2 style={{ margin: '0 2em 0.8em 0' }}>{isLandscape ? 'デッキの集計' : 'デッキの集計'}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.7em', marginBottom: '1em' }}>
              <div style={{ background: '#f0f4f8', borderRadius: 8, padding: '0.8em' }}>
                <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 4 }}>総デッキ数</div>
                <div style={{ color: '#1976d2', fontSize: '1.8em', fontWeight: 'bold', lineHeight: 1 }}>{deckInfo.totalDecks}</div>
              </div>
              <div style={{ background: '#f0f4f8', borderRadius: 8, padding: '0.8em' }}>
                <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 4 }}>デッキの中心にしたセット</div>
                <div style={{ color: '#388e3c', fontSize: '1.8em', fontWeight: 'bold', lineHeight: 1 }}>
                  {deckInfo.coveredArchetypes.length}<span style={{ color: '#777', fontSize: '0.55em' }}> / {deckInfo.totalArchetypes}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '1.05em', margin: '0 0 0.6em 0' }}>まだ中心にしていないセット</h3>
              {deckInfo.missingArchetypes.length === 0 ? (
                <div style={{ color: '#388e3c', fontWeight: 'bold' }}>対象のセットはすべて作成済み</div>
              ) : (
                <div style={{ display: 'flex', gap: '0.45em', flexWrap: 'wrap' }}>
                  {deckInfo.missingArchetypes.map(archetype => (
                    <span
                      key={archetype.key}
                      title={`${archetype.packTitle || archetype.name} (${archetype.cardTypeCount}種)`}
                      style={{ background: '#e3f2fd', color: '#1976d2', borderRadius: 999, padding: '0.22em 0.65em', fontWeight: 'bold', fontSize: '0.95em' }}
                    >
                      {archetype.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* デッキ詳細ウィンドウ */}
      {detailDeck && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDetailDeckName(null)}>
          <div className="dvm-content" onClick={e => e.stopPropagation()}>
            <button
              className="dvm-layout-close"
              aria-label="デッキ詳細を閉じる"
              style={{ position: 'absolute', top: 8, right: 12, fontSize: '1.3em' }}
              onClick={() => setDetailDeckName(null)}
            >
              ×
            </button>
            <div className="dvm-sidebar">
            <h2 className="dvm-title">{detailDeck.name}</h2>
            {ownership.active && <p className="mock-note">カードの枚数表示は、編集中の所持枚数です。</p>}
            <div className="dvm-header">
              {(() => {
                const thumb = detailDeck.thumbnail;
                if (thumb) {
                  return <img src={thumb} alt="サムネイル" className="dvm-thumb" />;
                }
                const cards = rehydrateCards(allDeckCards(detailDeck));
                const card = cards.find(c => c.id === detailDeck.thumbnailCardId) || cards.find(c => c.isDeckThumbnail) || cards[0];
                if (!card) return null;
                const isDoubleSided = card.isDoubleSided && card.front && card.back;
                const displayCard = isDoubleSided ? card.front : card;
                const src = displayCard?.image;
                if (!src) return null;
                return <img src={src} alt="サムネイル" className="dvm-thumb" />;
              })()}
              <span style={{ fontWeight: 'bold', color: '#1976d2', marginRight: '1em' }}>メインデッキ: {detailDeck.cards.reduce((sum, c) => sum + (c.count || 0), 0)}枚</span>
              {/* ▼▼▼ PDF出力＆リスト/グリッド切替ボタンを横並びにまとめる ▼▼▼ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
                <button style={{ background: '#1976d2', color: '#fff', borderRadius: '6px', padding: '0.4em 0.5em', fontWeight: 'bold', fontSize: '1em', border: 'none', cursor: 'pointer' }}
                  onClick={async () => { await exportDeckToA4PDF(detailDeck); }}>
                  PDF
                </button>
                <button style={{ background: '#388e3c', color: '#fff', borderRadius: '6px', padding: '0.4em 0.5em', fontWeight: 'bold', fontSize: '1em', border: 'none', cursor: 'pointer' }}
                  onClick={() => exportSingleDeckAsJson(detailDeck)}>
                  JSON
                </button>
                <button style={{ display: 'none' }}
                  onClick={async () => { await exportDeckAsSVG(detailDeck); }}>
                  SVG
                </button>
                <button style={{ background: '#3949ab', color: '#fff', borderRadius: '6px', padding: '0.4em 0.5em', fontWeight: 'bold', fontSize: '1em', border: 'none', cursor: 'pointer' }}
                  onClick={async () => { await exportDeckSvgToPng(detailDeck); }}>
                  PNG
                </button>
                <button className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}>≡</button>
                <button className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')}>■</button>
              </div>
            </div>
            </div>
            <div className="dvm-cards">
            {zones.map(zone => {
              const cards = sortDeckCards(rehydrateCards(zone.id === 'main' ? detailDeck.cards : sidesOf(detailDeck)[zone.id] || []));
              if (!cards.length) return null;
              return <section key={zone.id} aria-label={zone.name}>
                {zone.id !== 'main' && <h3 className="deck-zone-heading" style={{ color: zone.color }}>{zone.name}: {cards.reduce((sum, card) => sum + card.count, 0)}枚</h3>}
                <div className={viewMode === 'list' ? 'dvm-list-area' : 'card-grid dvm-grid'}>{cards.map(card => {
                  const face = card.isDoubleSided ? card.front : card;
                  return viewMode === 'list' ? <div key={card.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginBottom: 4, cursor: 'pointer' }} onClick={() => openCardDetail(card)}>
                    <img src={face.image} alt={face.name} style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 5 }} /><span style={{ flex: 1 }}><b>{card.name}</b> <span style={{ fontSize: '0.97em', color: '#666' }}>({card.isDoubleSided ? `${card.front.type} / ${card.back.type}` : card.type})</span></span><span style={{ color: zone.color, fontWeight: 'bold' }}>{ownership.active ? (ownership.getCount(card.id) === '' ? '未入力' : `${ownership.getCount(card.id)}枚`) : `${card.count}枚`}</span>
                  </div> : <div key={card.id} className="dvm-grid-cell" onClick={() => openCardDetail(card)}><img src={face.image} alt={face.name} className="dvm-grid-img" /><span className="dvm-grid-badge" style={{ background: ownership.active ? '#1976d2' : zone.color }}>{ownership.active ? (ownership.getCount(card.id) === '' ? '—' : ownership.getCount(card.id)) : card.count}</span></div>;
                })}</div>
              </section>;
            })}
            </div>
          </div>
        </div>
      )}
      {/* カード詳細モーダルは最前面に表示 */}
      {detailCard && (
        <CardDetailModal
          ownershipEditor={ownership} ownershipUsage={usage}
          card={detailCard}
          show={!!detailCard}
          onClose={closeCardDetail}
          zIndex={3000}
          onSetDeckThumbnail={async (cardId) => {
            const idNum = Number(cardId);
            setDeckThumbnailCardId(Number.isFinite(idNum) ? idNum : null);

            // メインデッキ内にあるカードなら従来通りフラグを付ける。トークンのみの場合は全てfalseのまま。
            setDeck(deck => {
              const existsInMain = deck.some(c => Number(c.id) === idNum);
              if (!existsInMain) return deck.map(c => ({ ...c, isDeckThumbnail: false }));
              return deck.map(c => Number(c.id) === idNum ? { ...c, isDeckThumbnail: true } : { ...c, isDeckThumbnail: false });
            });
            const updatedDecks = savedDecks.map(saved => saved.name !== currentDeckName ? saved : {
              ...withDeckSaveTimes(saved, saved),
              thumbnailCardId: Number.isFinite(idNum) ? idNum : null,
              cards: (saved.cards || []).map(card => ({ ...card, isDeckThumbnail: Number(card.id) === idNum })),
            });
            try { await saveDecks(updatedDecks); } catch { alert('デッキ画像の指定を保存できませんでした。空き容量を確認して、もう一度指定してください。'); }
          }}
          inDeck={detailCard ? zones.some(zone => countOf(zone.id, detailCard.id) > 0) : false}
          zones={zones} countOf={countOf} onZoneChange={changeZoneCount}
          countInDeck={detailCard ? getCardCountInDeck(detailCard.id) : 0}
          onIncrease={increaseCardCount}
          onDecrease={decreaseCardCount}
          getTokenCountInDeck={getCardCountInDeck}
          onTokenIncrease={increaseCardCount}
          onTokenDecrease={decreaseCardCount}
          showFront={showFront}
          setShowFront={setShowFront}
          hideDeckActions={detailHideDeckActions || !!detailDeck} // 明示指定 or デッキ詳細ウィンドウから開いた場合は非表示
        />
      )}
    </div>
  );
}

// --- ホーム: 募集中イベント表示 ---
