import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { commitOwnedCounts } from './store.js';
import { ownedSnapshot, ownedValue, validateOwned } from './ownership.js';

export function useOwnershipEditor(cards, gameId) {
  const [draft, setDraft] = useState(null);
  const original = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const active = draft !== null;
  const changes = useMemo(() => active ? cards.filter(card => draft[card.id] !== original.current[card.id]) : [], [active, cards, draft]);
  const getCount = useCallback(id => draft?.[id] ?? '', [draft]);
  const setCount = useCallback((id, value) => {
    if (locked.current) return;
    const count = validateOwned(value);
    setDraft(previous => previous && Object.hasOwn(previous, id) ? { ...previous, [id]: count } : previous);
  }, []);
  const changeCount = useCallback((id, delta) => {
    if (locked.current) return;
    setDraft(previous => {
      if (!previous || !Object.hasOwn(previous, id)) return previous;
      const count = Number(previous[id]) + delta;
      return Number.isSafeInteger(count) && count >= 0 ? { ...previous, [id]: count } : previous;
    });
  }, []);
  useEffect(() => {
    if (!changes.length) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes.length]);
  const begin = () => { original.current = ownedSnapshot(cards); setDraft({ ...original.current }); setError(''); };
  const cancel = () => { if (!locked.current) { setDraft(null); setError(''); } };
  const complete = async () => {
    if (locked.current || !active) return;
    locked.current = true; setSaving(true); setError('');
    try {
      await commitOwnedCounts(gameId, Object.fromEntries(changes.map(card => [card.id, draft[card.id]])));
      setDraft(null);
    } catch {
      setError('保存できませんでした。空き容量を確認して「完了」で再試行するか、「キャンセル」で変更を破棄してください。');
    } finally { locked.current = false; setSaving(false); }
  };
  const previewCards = useMemo(() => active ? cards.map(card => ({ ...card, ownedCount: draft[card.id] ?? ownedValue(card.ownedCount) })) : cards, [active, cards, draft]);
  return { active, saving, error, draft, original: original.current, changes, previewCards, getCount, setCount, changeCount, begin, cancel, complete };
}
