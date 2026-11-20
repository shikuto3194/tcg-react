import { useLocal } from '../local/store.js';
import { ownershipShortages } from '../local/ownership.js';

export default function OwnershipShortages({ savedDecks, viewMode, setViewMode, onCardClick, previewCards }) {
  const { cards } = useLocal();
  const shortages = ownershipShortages(previewCards || cards, savedDecks);
  return <section className="ownership-shortages" aria-label="所持枚数が足りないカード">
    <div className="match-history-heading"><h2>所持枚数が足りないカード · {shortages.length}種</h2><div className="view-toggle-row"><button className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} aria-label="リスト表示" onClick={() => setViewMode('list')}>≡</button><button className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} aria-label="グリッド表示" onClick={() => setViewMode('grid')}>■</button></div></div>
    <p className="match-fine">保存デッキ全体のメイン・全サイドを合計。所持枚数が未入力のカードは除きます。</p>
    <div className={`ownership-cards ${viewMode}`}>{shortages.map(card => {
      const face = card.isDoubleSided ? card.front : card;
      return <button type="button" className="ownership-card" key={card.id} onClick={() => onCardClick(card)}><img src={face.image} alt={face.name} /><span><strong>{face.name}</strong><span>所持 {card.ownedCount}枚 ／ 使用 {card.usedCount}枚</span><b>不足 {card.shortage}枚</b></span></button>;
    })}</div>
    {!shortages.length && <p className="match-empty">所持枚数を超えているカードはありません。</p>}
  </section>;
}
