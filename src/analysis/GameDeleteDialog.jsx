import { useEffect, useRef, useState } from 'react';
import { commitGameDeletion, getGames, getLibraryRevision } from '../local/store.js';

export default function GameDeleteDialog({ gameId, name, onClose }) {
  const dialog = useRef(null);
  const cancel = useRef(null);
  const [revision] = useState(getLibraryRevision);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); cancel.current.focus(); }, []);
  const commit = async event => {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true); setError('');
    try { await commitGameDeletion(gameId, revision); }
    catch (failure) {
      setError(failure.code === 'CONFLICT' ? 'データが更新されています。キャンセルして、もう一度確認してください。' : '削除できませんでした。データは残っています。空き容量を確認して、もう一度お試しください。');
      setBusy(false);
    }
    // The app switches games only after a successful save, closing this dialog.
  };
  return <dialog className="mock-settings match-ui" ref={dialog} data-ai-private aria-labelledby="delete-game-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={commit}>
      <h2 id="delete-game-title">ゲームを削除</h2>
      <p>「{name}」を削除します。</p>
      <p>このゲームのカード・画像・作成中／保存デッキ・所持枚数・戦績・設定がすべて消えます。元に戻せません。</p>
      <p>残したいデータがある場合は、キャンセルして「設定 → バックアップ」で保存してください。他のゲームや、保存済みの出力ファイルは削除しません。</p>
      {getGames().length === 1 && <p>最後のゲームを削除すると、空の「新しいゲーム」が作られます。</p>}
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />このゲームのデータを削除することを確認しました</label>
      {error && <p role="alert">{error}</p>}
      <div className="match-actions">
        <button type="button" className="match-secondary" ref={cancel} disabled={busy} onClick={onClose}>キャンセル</button>
        <button type="submit" disabled={!confirmed || busy}>{busy ? '削除中…' : '削除する'}</button>
      </div>
    </form>
  </dialog>;
}
