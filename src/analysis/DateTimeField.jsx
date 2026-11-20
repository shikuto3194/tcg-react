import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { formatDateTime, localDateTime } from './model.js';

export default function DateTimeField({ value, onChange, label = '日時' }) {
  const id = useId();
  const root = useRef(null);
  const input = useRef(null);
  const calendar = useRef(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value || localDateTime()).slice(0, 7));
  const [year, monthNumber] = month.split('-').map(Number);
  const offset = new Date(year, monthNumber - 1, 1).getDay();
  const count = new Date(year, monthNumber, 0).getDate();
  const close = () => { setOpen(false); input.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = input.current.getBoundingClientRect();
      const popup = calendar.current;
      popup.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = `${Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - popup.offsetHeight - 8))}px`;
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open, month]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const shiftMonth = delta => setMonth(localDateTime(new Date(year, monthNumber - 1 + delta, 1)).slice(0, 7));
  return <div className="match-datetime" ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <label className="match-field" htmlFor={id}>{label}
      <input id={id} ref={input} type="text" readOnly value={value ? formatDateTime(value) : ''} placeholder="不明" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => { setMonth((value || localDateTime()).slice(0, 7)); setOpen(!open); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setMonth((value || localDateTime()).slice(0, 7)); setOpen(!open); } }} />
    </label>
    {open && <div id={`${id}-calendar`} ref={calendar} className="match-calendar" role="dialog" aria-label="日時を選択">
      <div className="match-calendar-heading"><button type="button" className="match-secondary" aria-label="前の月" onClick={() => shiftMonth(-1)}>‹</button><strong>{year}年{monthNumber}月</strong><button type="button" className="match-secondary" aria-label="次の月" onClick={() => shiftMonth(1)}>›</button></div>
      <div className="match-calendar-grid">
        {['日', '月', '火', '水', '木', '金', '土'].map(day => <span key={day}>{day}</span>)}
        {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} />)}
        {Array.from({ length: count }, (_, index) => {
          const day = index + 1;
          const date = `${month}-${String(day).padStart(2, '0')}`;
          return <button key={day} type="button" className="match-secondary" aria-label={`${year}年${monthNumber}月${day}日`} aria-pressed={value.startsWith(date)} onClick={() => onChange(value.slice(11) ? `${date}T${value.slice(11)}` : date)}>{day}</button>;
        })}
      </div>
      <label className="match-field">時刻<input type="time" value={value.slice(11)} onChange={event => { const date = (value || localDateTime()).slice(0, 10); onChange(event.target.value ? `${date}T${event.target.value}` : date); }} /></label>
      <div className="match-actions"><button type="button" className="match-secondary" onClick={() => { onChange(''); close(); }}>不明にする</button><button type="button" className="match-secondary" onClick={() => { const now = localDateTime(); onChange(now); setMonth(now.slice(0, 7)); }}>現在日時</button><button type="button" onClick={close}>完了</button></div>
    </div>}
  </div>;
}
