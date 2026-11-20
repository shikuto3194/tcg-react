import { useState } from 'react';
import { validateOwned } from '../local/ownership.js';

export default function OwnedCountControls({ cardId, editor }) {
  const count = editor.getCount(cardId);
  const [error, setError] = useState('');
  return <section className="owned-count-editor" aria-label="所持枚数の編集">
    <p>所持枚数を閲覧・編集中</p>
    <div className="cdm-deck-controls">
      <button type="button" className="cdm-btn-minus" aria-label="所持枚数を減らす" disabled={Number(count) <= 0} onClick={() => { setError(''); editor.changeCount(cardId, -1); }}>−</button>
      <label>所持枚数<input type="text" inputMode="numeric" aria-label="所持枚数" placeholder="未入力" value={count} onChange={event => { try { editor.setCount(cardId, validateOwned(event.target.value)); setError(''); } catch (error) { setError(error.message); } }} /></label>
      <button type="button" className="cdm-btn-plus" aria-label="所持枚数を増やす" disabled={Number(count) >= Number.MAX_SAFE_INTEGER} onClick={() => { setError(''); editor.changeCount(cardId, 1); }}>+</button>
    </div>
    <button type="button" className="ownership-secondary" disabled={count === ''} onClick={() => { setError(''); editor.setCount(cardId, ''); }}>未入力に戻す</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
