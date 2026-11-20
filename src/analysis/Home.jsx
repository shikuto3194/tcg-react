import { useEffect, useRef, useState } from 'react';
import { createGame, getGames, switchGame, useLocal, useEvents } from '../local/store.js';
import EventEditor from './EventEditor.jsx';
import { allRecords, createEvent, daysAgo, filterRecords, recordName, recordText, formatDateTime, matchTitle, resultNames } from './model.js';
import ResultsChart from './ResultsChart.jsx';
import OwnershipShortages from '../components/OwnershipShortages.jsx';
import GameDeleteDialog from './GameDeleteDialog.jsx';

export default function Home({ savedDecks, onBeforeSwitch, viewMode, setViewMode, onCardClick, ownershipEditor }) {
  const { gameId, name } = useLocal();
  const events = useEvents(gameId);
  const records = allRecords(events);
  const [feedback, setFeedback] = useState('');
  const [recording, setRecording] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newName, setNewName] = useState('');
  const dialog = useRef(null);
  useEffect(() => { if (adding) dialog.current?.showModal(); }, [adding]);
  return <div className="match-ui match-home">
    <select disabled={ownershipEditor?.active} title={ownershipEditor?.active ? "所持枚数の編集を完了するか、キャンセルしてください。" : undefined} className="match-game-select" aria-label="ゲーム" value={gameId} onChange={event => { if (event.target.value === '__add') setAdding(true); else if (event.target.value === '__delete') setDeleting(true); else { onBeforeSwitch(); switchGame(event.target.value); } }}>
      {getGames().map(game => <option key={game.id} value={game.id}>{game.name}</option>)}
      <option value="__add">＋ ゲームを追加</option>
      <option value="__delete" data-ai-private>このゲームを削除</option>
    </select>
    <div className="match-summaries" aria-live="polite">
      <p className="match-summary"><span>直近30日</span><strong>{recordText(filterRecords(records, { from: daysAgo(29), to: daysAgo() }))}</strong></p>
      <p className="match-summary"><span>累計</span><strong>{recordText(records)}</strong></p>
    </div>
    <div className="match-home-actions"><button type="button" onClick={() => { setFeedback(''); setRecording(createEvent()); }}>戦績を記録</button><span role="status">{feedback}</span></div>
    <ResultsChart records={records} from={daysAgo(29)} to={daysAgo()} title="直近30日の勝率" />
    <section className="match-recent"><h2>直近の戦績</h2>{[...records].reverse().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map(row => <div className="match-history-row" key={row.id}><span className={`match-result-label ${row.result}`}>{resultNames[row.result] || '不明'}</span><div className="match-history-body"><time>{formatDateTime(row.at)}</time><strong>{row.eventName || 'イベント名不明'} · {matchTitle(row)}</strong><span>{recordName(row, 'deckName') || '使用デッキ不明'} ／ 対 {recordName(row, 'opponent') || '相手不明'}</span></div><button type="button" className="match-secondary" onClick={() => setEditing(events.find(event => event.id === row.eventId))}>詳細</button></div>)}{!records.length && <p className="match-empty">戦績はまだありません。</p>}</section>
    <OwnershipShortages previewCards={ownershipEditor?.active ? ownershipEditor.previewCards : undefined} savedDecks={savedDecks} viewMode={viewMode} setViewMode={setViewMode} onCardClick={onCardClick} />
    {editing && <EventEditor event={editing} savedDecks={savedDecks} onClose={() => setEditing(null)} />}
    {recording && <EventEditor event={recording} savedDecks={savedDecks} isNew onClose={() => setRecording(null)} onSaved={() => setFeedback('記録しました。')} />}
    {deleting && <GameDeleteDialog gameId={gameId} name={name} onClose={() => setDeleting(false)} />}
    {adding && <dialog className="mock-settings match-ui" ref={dialog} onCancel={() => setAdding(false)}>
      <form onSubmit={event => { event.preventDefault(); if (newName.trim()) { onBeforeSwitch(); createGame(newName); } }}>
        <h2>ゲームを追加</h2><label className="match-field">ゲーム名<input type="text" autoFocus required maxLength={60} value={newName} onChange={event => setNewName(event.target.value)} /></label>
        <div className="match-actions"><button type="button" className="match-secondary" onClick={() => setAdding(false)}>キャンセル</button><button disabled={!newName.trim()}>追加</button></div>
      </form>
    </dialog>}
  </div>;
}
