import { useEffect, useId, useRef, useState } from 'react';

export default function OpponentField({ value, onChange, savedDecks, records, full = false }) {
  const id = useId();
  const root = useRef(null);
  const picker = useRef(null);
  const [open, setOpen] = useState(false);
  const names = [...new Set([...savedDecks.map(deck => deck.name), ...records.map(row => row.opponent).filter(Boolean)])];
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={root} className={`match-field match-opponent${full ? ' match-full' : ''}`} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); picker.current?.focus(); } }}>
    <label htmlFor={id}>相手のデッキ</label>
    <div className="match-opponent-input"><input id={id} type="text" value={value} maxLength={80} placeholder="選択または手入力（任意）" onChange={event => onChange(event.target.value)} /><button ref={picker} type="button" className="match-secondary" aria-label="相手のデッキを選択" aria-expanded={open} aria-controls={`${id}-options`} onClick={() => setOpen(!open)}><span className="disclosure-chevron" aria-hidden="true" /></button></div>
    {open && <div id={`${id}-options`} className="match-opponent-options" role="group" aria-label="相手のデッキ候補">
      {names.length ? names.map(name => <button key={name} type="button" className="match-secondary" onClick={() => { onChange(name); setOpen(false); picker.current?.focus(); }}>{name}</button>) : <span>保存デッキはありません。名前を入力できます。</span>}
    </div>}
  </div>;
}
