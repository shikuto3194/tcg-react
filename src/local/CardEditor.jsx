import { useState } from 'react';
import { editCard, keysOf, useLocal, valueOf } from './store.js';

export function LocalCardMeta({ face }) {
  const { settings } = useLocal();
  return <div className="cdm-meta">{keysOf(settings).map((key, i) => <span key={key}>{settings.labels[i]}: {valueOf(face, key) || '-'}</span>)}</div>;
}
export function LocalCardEditor({ card, side, children, disabled = false }) {
  const { settings } = useLocal();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const face = side ? card[side] : card;
  const keys = keysOf(settings);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  if (disabled) return children;
  if (!draft) return <>{children}<div className="mock-edit-actions"><button onClick={() => { setError(''); setDraft({ name: face.name, cardNumber: face.cardNumber || '', effect: face.effect || '', limit: card.mockLimit ?? '', ...Object.fromEntries(keys.map(key => [key, valueOf(face, key)])) }); }}>編集</button></div></>;
  return <form className="mock-card-editor" onSubmit={event => { event.preventDefault(); try { editCard(card.id, side, draft); setDraft(null); setError(''); } catch (error) { setError(error.message); } }}>
    <h2 className="cdm-card-name">カードデータを編集{side ? `（${side === 'front' ? '表' : '裏'}面）` : ''}</h2>
    <p className="mock-note">カードID：{card.id}</p>
    <label className="mock-stack">カード名<input required value={draft.name} onChange={event => update('name', event.target.value)} /></label>
    <label className="mock-stack">カード番号<input value={draft.cardNumber} onChange={event => update('cardNumber', event.target.value)} /></label>
    <div className="mock-field-names">{keys.map((key, i) => <label key={key}><span>{settings.labels[i]}</span><input value={draft[key]} onChange={event => update(key, event.target.value)} /></label>)}</div>
    <p className="mock-note">収録セット：{settings.source === 'folder' ? `${card.mockFolder || '未設定'}（画像が入っているフォルダ名）` : `${settings.labels[keys.indexOf(settings.source)]}に入力した名前`}。「設定」でセット名に使うものを変えられます。</p>
    <label className="mock-stack">テキスト<textarea rows={7} value={draft.effect} onChange={event => update('effect', event.target.value)} /></label>
      <label className="mock-stack">採用上限<input type="number" min="0" step="1" placeholder="上限なし" value={draft.limit} onChange={event => update('limit', event.target.value)} /></label>
    <p className="mock-note">デッキに入れられる枚数です。空欄なら上限なし、0なら入れられません。表裏で共通です。今あるデッキの枚数は変わりません。</p>
    {error && <p role="alert">{error}</p>}
    <div className="mock-edit-actions"><button type="button" className="mock-cancel" onClick={() => setDraft(null)}>キャンセル</button><button type="submit">保存</button></div>
  </form>;
}
