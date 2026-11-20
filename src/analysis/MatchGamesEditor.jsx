import { useState } from 'react';
import OpponentField from './OpponentField.jsx';
import { RecordedDeckField, RecordedDeckSnapshot } from './RecordedDeck.jsx';
import { createGameRecord, recordText, resultNames, turnNames } from './model.js';

export default function MatchGamesEditor({ match, decks, savedDecks, settings, cards, records, onChange }) {
  const [removing, setRemoving] = useState('');
  const games = match.games || [];
  const update = (id, patch) => onChange(games.map(game => game.id === id ? { ...game, ...patch } : game));
  return <section className="match-games" aria-label="マッチ内のゲーム">
    <h4>マッチ内のゲーム</h4>
    <p className="match-fine">1ゲームずつ、使用デッキと結果を記録できます。マッチ全体の結果は別に入力してください。</p>
    {games.length > 0 && <p className="match-game-total">{recordText(games)}</p>}
    {games.map((game, index) => <details className="match-game" key={game.id} open>
      <summary>第{index + 1}ゲーム · {resultNames[game.result] || '結果不明'}</summary>
      <div className="match-editor-fields">
        <RecordedDeckField record={game} decks={decks} savedDecks={savedDecks} settings={settings} onChange={patch => update(game.id, patch)} />
        <OpponentField value={game.opponent} onChange={opponent => update(game.id, { opponent })} savedDecks={savedDecks} records={records} />
        <fieldset className="match-results match-full"><legend>ゲームの結果</legend>{Object.entries({ '': '不明', ...resultNames }).map(([value, label]) => <label key={value} data-selected={game.result === value}><input type="radio" name={`game-result-${game.id}`} checked={game.result === value} onChange={() => update(game.id, { result: value })} />{label}</label>)}</fieldset>
        <label className="match-field">先攻・後攻<select value={game.turn} onChange={event => update(game.id, { turn: event.target.value })}>{Object.entries(turnNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="match-field match-full">メモ<textarea rows={2} maxLength={2000} value={game.memo} onChange={event => update(game.id, { memo: event.target.value })} /></label>
      </div>
      <RecordedDeckSnapshot record={game} cards={cards} />
      {removing === game.id ? <div className="match-delete-confirm" role="alert"><p>第{index + 1}ゲームの記録を削除しますか？</p><div className="match-actions"><button type="button" className="match-secondary" onClick={() => setRemoving('')}>キャンセル</button><button type="button" className="match-delete" onClick={() => { onChange(games.filter(item => item.id !== game.id)); setRemoving(''); }}>削除する</button></div></div> : <button type="button" className="match-delete" onClick={() => setRemoving(game.id)}>第{index + 1}ゲームを削除</button>}
    </details>)}
    <button type="button" className="match-secondary" onClick={() => onChange([...games, createGameRecord()])}>ゲームを追加</button>
  </section>;
}
