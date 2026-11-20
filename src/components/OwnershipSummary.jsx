import { ownershipSummary, ownedText, ownershipShortages } from '../local/ownership.js';

export default function OwnershipSummary({ editor, savedDecks, onCardClick }) {
  const summary = ownershipSummary(editor.previewCards);
  const shortages = ownershipShortages(editor.previewCards, savedDecks);
  return <div className="ownership-summary">
    <h2>所持カード</h2>
    <p className="mock-note">このゲーム全体の集計です。編集中の枚数を反映しています。</p>
    <dl className="ownership-totals">
      <div><dt>所持種類</dt><dd>{summary.owned}種</dd></div>
      <div><dt>所持合計</dt><dd>{summary.total}枚</dd></div>
      <div><dt>0枚</dt><dd>{summary.zero}種</dd></div>
      <div><dt>未入力</dt><dd>{summary.unknown}種</dd></div>
    </dl>
    <p>登録 {summary.registered}種 ／ 不足 {shortages.length}種・{shortages.reduce((sum, card) => sum + card.shortage, 0)}枚</p>
    <p className="mock-note">不足は保存デッキ全体のメイン・全サイドを合計。所持枚数が未入力のカードは除きます。</p>
    <details open><summary>セット別の内訳</summary>
      <div className="ownership-table-wrap"><table className="ownership-table"><thead><tr><th>セット</th><th>所持／登録</th><th>枚数</th><th>未入力</th></tr></thead><tbody>{summary.packs.map(pack => <tr key={pack.name}><th>{pack.name || '未設定'}</th><td>{pack.owned}／{pack.registered}種</td><td>{pack.total}枚</td><td>{pack.unknown}種</td></tr>)}</tbody></table></div>
    </details>
    <details><summary>変更したカード · {editor.changes.length}種</summary>
      {!editor.changes.length && <p>変更はありません。</p>}
      <ul className="ownership-changes">{editor.changes.map(card => <li key={card.id}><button type="button" onClick={() => onCardClick(card)}>{card.name}<span>{ownedText(editor.original[card.id])} → {ownedText(editor.getCount(card.id))}</span></button></li>)}</ul>
    </details>
  </div>;
}
