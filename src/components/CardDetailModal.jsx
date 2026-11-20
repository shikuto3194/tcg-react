import { getLocalLimit, useLocal } from '../local/store.js';
import { LocalCardMeta, LocalCardEditor } from '../local/CardEditor.jsx';
import React, { useState } from 'react';
import { toAbsPath } from '../utils/deckUtils';
import '../styles/modal.css';
import OwnedCountControls from './OwnedCountControls.jsx';
import { matchesOwnership, ownedText } from '../local/ownership.js';


/**
 * カード詳細モーダル（共通コンポーネント）
 *
 * hideDeckActions=true でデッキ操作ボタンを非表示にする（閲覧専用モード）。
 * useAbsPath=true で画像パスを絶対パスに変換する（/events/:id 等のネスト配下で使用）。
 */
export default function CardDetailModal({
  card: inputCard,
  ownershipEditor,
  ownershipUsage,
  show = true,
  onClose,
  onSetDeckThumbnail,
  inDeck,
  countInDeck,
  onIncrease,
  onDecrease,
  zones,
  countOf,
  onZoneChange,
  getTokenCountInDeck,
  onTokenIncrease,
  onTokenDecrease,
  showFront: showFrontProp,
  setShowFront: setShowFrontProp,
  hideDeckActions = false,
  useAbsPath = false,
  zIndex = 1000,
}) {
  // 閲覧専用モード用の内部 showFront state
  const { cards: cardData } = useLocal();
  const card = cardData.find(item => item.id === inputCard?.id) || inputCard;
  const [internalShowFront, setInternalShowFront] = useState(true);
  // トークン表示用のstate
  const [tokenIndex, setTokenIndex] = useState(null);
  const showFront = showFrontProp !== undefined ? showFrontProp : internalShowFront;
  const setShowFront = setShowFrontProp || setInternalShowFront;

  if (show === false || !card) return null;

  // ダブルフェイス対応
  const isDoubleSided = card.isDoubleSided && card.front && card.back;
  const hasRelatedTokens = card.relatedTokens && card.relatedTokens.length > 0;
  const showToken = tokenIndex !== null;

  const getTokenCard = (tokenName) => cardData.find(c => c.name === tokenName);

  let activeSide;
  if (showToken && hasRelatedTokens) {
    const resolved = getTokenCard(card.relatedTokens[tokenIndex]);
    activeSide = resolved || (isDoubleSided ? (showFront ? card.front : card.back) : card);
  } else {
    activeSide = isDoubleSided ? (showFront ? card.front : card.back) : card;
  }

  const handleTokenToggle = () => {
    if (!showToken && hasRelatedTokens) setTokenIndex(0);
    else setTokenIndex(null);
  };

  const activeIsToken = showToken && hasRelatedTokens;
  const ownedEditing = ownershipEditor?.active;
  const ownedCardId = activeIsToken ? activeSide.id : card.id;
  const owned = ownedEditing ? ownershipEditor.getCount(ownedCardId) : (activeIsToken ? activeSide : card).ownedCount;
  const usage = ownershipUsage?.get(ownedCardId);
  const mainMaxCount = getLocalLimit(card);
  const tokenMaxCount = getLocalLimit(activeSide);
  const maxCount = activeIsToken ? tokenMaxCount : mainMaxCount;
  const currentCount = activeIsToken
    ? (typeof getTokenCountInDeck === 'function' ? (Number(getTokenCountInDeck(activeSide.id)) || 0) : 0)
    : countInDeck;

  const handleIncrease = () => {
    if (activeIsToken) {
      if (typeof onTokenIncrease === 'function') onTokenIncrease(activeSide.id);
      return;
    }
    if (typeof onIncrease === 'function') onIncrease(card.id);
  };
  const handleDecrease = () => {
    if (activeIsToken) {
      if (typeof onTokenDecrease === 'function') onTokenDecrease(activeSide.id);
      return;
    }
    if (typeof onDecrease === 'function') onDecrease(card.id);
  };

  const imgSrc = useAbsPath ? toAbsPath(activeSide.image) : activeSide.image;
  const renderZoneControls = zone => {
    const cardId = activeIsToken ? activeSide.id : card.id;
    const count = countOf(zone.id, cardId);
    return <div className="cdm-deck-controls" key={zone.id} style={{ '--zone-color': zone.color }}>
      <span className="cdm-row-label">{zone.name}</span>
      <button type="button" className="cdm-btn-minus" aria-label={`${zone.name}から減らす`} disabled={count <= 0} onClick={() => onZoneChange(zone.id, cardId, -1)}>-</button>
      <span>{count} / {Number.isFinite(maxCount) ? maxCount : '∞'}</span>
      <button type="button" className="cdm-btn-plus" aria-label={`${zone.name}に追加`} disabled={count >= maxCount} onClick={() => onZoneChange(zone.id, cardId, 1)}>+</button>
    </div>;
  };

  return (
    <div className="cdm-overlay" style={zIndex !== 1000 ? { zIndex } : undefined} onClick={onClose}>
      <div className="cdm-content" onClick={e => e.stopPropagation()}>
        <button className="cdm-close" aria-label="カード詳細を閉じる" onClick={onClose}>×</button>
        <div className="cdm-image-wrap">
          <img src={imgSrc} alt={activeSide.name} className="cdm-card-img" />
        </div>
        {/* ダブルフェイス切り替え */}
        {isDoubleSided && !showToken && (
          <button className="cdm-toggle-btn" onClick={() => setShowFront(f => !f)}>
            {showFront ? '裏面を見る' : '表面に戻す'}
          </button>
        )}
        {/* トークン切り替え（ダブルフェイスでない場合） */}
        {hasRelatedTokens && !isDoubleSided && (
          <div style={{ textAlign: 'center', marginBottom: '1em' }}>
            <button className="cdm-token-toggle" onClick={handleTokenToggle}>
              {showToken ? '元のカードに戻る' : 'トークンを見る'}
            </button>
            {showToken && card.relatedTokens.length > 1 && (
              <div className="cdm-token-nav">
                <button onClick={() => setTokenIndex(i => Math.max(0, i - 1))} disabled={tokenIndex === 0}>◀</button>
                <span>{activeSide.name}（{tokenIndex + 1}/{card.relatedTokens.length}）</span>
                <button onClick={() => setTokenIndex(i => Math.min(card.relatedTokens.length - 1, i + 1))} disabled={tokenIndex === card.relatedTokens.length - 1}>▶</button>
              </div>
            )}
          </div>
        )}
        {/* ダブルフェイス＋トークン両方持ち */}
        {isDoubleSided && hasRelatedTokens && (
          <div style={{ textAlign: 'center', marginBottom: '1em' }}>
            <div style={{ display: 'flex', gap: '0.5em', justifyContent: 'center' }}>
              {!showToken && (
                <button className="cdm-toggle-btn" onClick={() => setShowFront(f => !f)}>
                  {showFront ? '裏面を見る' : '表面に戻す'}
                </button>
              )}
              <button className="cdm-token-toggle" onClick={handleTokenToggle}>
                {showToken ? '元のカードに戻る' : 'トークンを見る'}
              </button>
            </div>
            {showToken && card.relatedTokens.length > 1 && (
              <div className="cdm-token-nav">
                <button onClick={() => setTokenIndex(i => Math.max(0, i - 1))} disabled={tokenIndex === 0}>◀</button>
                <span>{activeSide.name}（{tokenIndex + 1}/{card.relatedTokens.length}）</span>
                <button onClick={() => setTokenIndex(i => Math.min(card.relatedTokens.length - 1, i + 1))} disabled={tokenIndex === card.relatedTokens.length - 1}>▶</button>
              </div>
            )}
          </div>
        )}
        {/* デッキ操作ボタン群 */}
        {ownedEditing && <OwnedCountControls key={`owned-${ownedCardId}`} cardId={ownedCardId} editor={ownershipEditor} />}
        {!ownedEditing && !hideDeckActions && (
          <>
            <div style={{ minHeight: '2.5em', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1em' }}>
              {onSetDeckThumbnail && !card.isBanned && (activeIsToken ? (currentCount > 0) : inDeck) && (activeIsToken ? tokenMaxCount > 0 : mainMaxCount > 0) ? (
                <button className="cdm-thumbnail-btn" onClick={() => { onSetDeckThumbnail(activeIsToken ? activeSide.id : card.id); onClose(); }}>
                  デッキ画像に指定
                </button>
              ) : (
                <span style={{ display: 'inline-block', width: '8.5em', height: '2.2em' }}></span>
              )}
            </div>
            {zones?.length > 1 ? <div className="cdm-deck-zones" aria-label="デッキ別の枚数">
              {renderZoneControls(zones[0])}
              {zones.length > 4 ? <details className="cdm-side-decks">
                <summary aria-label="サイドデッキのボタンを表示">サイドデッキ</summary>
                {zones.slice(1).map(renderZoneControls)}
              </details> : zones.slice(1).map(renderZoneControls)}
            </div> : <div className="cdm-deck-controls">
              {maxCount > 0 || currentCount > 0 ? (
                <>
                  <button
                    onClick={handleDecrease}
                    className={`cdm-btn-minus${activeIsToken ? ' token' : ''}`}
                    disabled={currentCount <= 0}
                  >-</button>
                  <span>{currentCount} / {Number.isFinite(maxCount) ? maxCount : '∞'}</span>
                  <button
                    onClick={handleIncrease}
                    className={`cdm-btn-plus${activeIsToken ? ' token' : ''}`}
                    disabled={currentCount >= maxCount}
                  >+</button>
                </>
              ) : !activeIsToken ? (
                <span className="cdm-cannot-add">このカードはデッキに入れられません。</span>
              ) : null}
            </div>}
          </>
        )}
        <LocalCardEditor disabled={ownedEditing} key={String(activeIsToken ? activeSide.id : card.id) + (isDoubleSided && !activeIsToken ? (showFront ? 'front' : 'back') : '')} card={activeIsToken ? activeSide : card} side={isDoubleSided && !activeIsToken ? (showFront ? 'front' : 'back') : null}>
        <h2 className="cdm-card-name">{activeSide.name}</h2>
        <LocalCardMeta face={activeSide} />
        <div className="cdm-meta">
          <span>収録セット: {activeSide.pack || '-'}</span>
          <span>カード番号: {activeSide.cardNumber || '-'}</span>
          <span>カードID: {activeIsToken ? activeSide.id : card.id}</span>
          <span>所持枚数: {ownedText(owned)}</span>
        </div>
        <div className="cdm-effect">
          {renderEffect(activeSide.effect)}
        </div>
        </LocalCardEditor>
        {ownedEditing && <section className="ownership-usage" aria-label="保存デッキでの使用内訳"><strong>保存デッキでの使用 · {usage?.total || 0}枚</strong><ul>{usage?.entries.map((entry, index) => <li key={index}>{entry.deck} · {entry.zone}：{entry.count}枚</li>)}</ul>{!usage?.total && <p>保存デッキでは使われていません。</p>}{matchesOwnership(owned, 'shortage', usage?.total) && <p>不足 {usage.total - Number(owned)}枚</p>}</section>}
      </div>
    </div>
  );
}

// User text is rendered as text, never HTML.
function renderEffect(effect) { return effect || 'テキストなし'; }
