import { useMemo, useState } from 'react';
import { addCard, keysOf, useLocal } from './store.js';
import { artworkUrl, validateArtwork } from './cardArtwork.js';

const emptyDraft = () => ({ name: '', cardNumber: '', effect: '', limit: '', ownedCount: '' });
export default function CardAddForm({ onAdded }) {
  const { settings, name: gameName } = useLocal();
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState('');
  const update = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setMessage(''); };
  const preview = useMemo(() => {
    if (!draft.name.trim()) return {};
    const face = { ...draft, pack: settings.source === 'folder' ? '' : draft[settings.source] || '' };
    const drawing = { ...settings, gameName };
    try { validateArtwork(face, drawing); return { image: artworkUrl(face, drawing) }; }
    catch (error) { return { error: error.message }; }
  }, [draft, settings, gameName]);
  return <section className="mock-section">
    <h3>画像なしで追加</h3>
    <p className="mock-note">カード名は必須です。ほかは空欄でも追加できます。</p>
    <form className="mock-card-editor" onSubmit={event => {
      event.preventDefault();
      try { addCard(draft); setDraft(emptyDraft()); setMessage('カードを追加しました。'); onAdded(); }
      catch (error) { setMessage(error.message); }
    }}>
      <label className="mock-stack">カード名（必須）<input required value={draft.name} onChange={event => update('name', event.target.value)} /></label>
      <label className="mock-stack">カード番号<input value={draft.cardNumber} onChange={event => update('cardNumber', event.target.value)} /></label>
      <div className="mock-field-names">{keysOf(settings).map((key, i) => <label key={key}><span>{settings.labels[i]}</span><input value={draft[key] || ''} onChange={event => update(key, event.target.value)} /></label>)}</div>
      <p className="mock-note">「ゲーム設定」の項目名を優先し、ゲーム名も参考にして背景や数値を配置します。例：色、属性、コスト、パワー、HP。</p>
      <label className="mock-stack">テキスト<textarea rows={6} value={draft.effect} onChange={event => update('effect', event.target.value)} /></label>
      <label className="mock-stack">所持枚数<input type="number" min="0" step="1" placeholder="未入力" value={draft.ownedCount} onChange={event => update('ownedCount', event.target.value)} /></label>
      <p className="mock-note">表裏で共通です。未入力はホームの不足カードに表示しません。</p>
      <label className="mock-stack">採用上限<input type="number" min="0" step="1" placeholder="上限なし" value={draft.limit} onChange={event => update('limit', event.target.value)} /></label>
      <p className="mock-note">空欄なら上限なし、0ならデッキに入れられません。長文は配置と文字サイズを調整し、読みやすく収まらない場合は追加前に案内します。</p>
      {preview.image && <figure className="local-artwork-preview"><img src={preview.image} alt="追加するカードの見本" /><figcaption>カードの見本</figcaption></figure>}
      {preview.error && <p role="alert">{preview.error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="mock-settings-actions"><button type="submit" disabled={!draft.name.trim() || !!preview.error}>カードを追加</button></div>
    </form>
  </section>;
}
