import { useEffect, useRef, useState } from 'react';
import { useLocal, useEvents, putEvent, removeEvent, flushLibrary } from '../local/store.js';
import DateTimeField from './DateTimeField.jsx';
import OpponentField from './OpponentField.jsx';
import MatchGamesEditor from './MatchGamesEditor.jsx';
import { RecordedDeckField, RecordedDeckSnapshot } from './RecordedDeck.jsx';
import { allRecords, createMatch, matchTitle, nextMatch, recordName, resultNames, snapshotDeck, turnNames } from './model.js';

export default function EventEditor({ event, savedDecks, onClose, onSaved, isNew = false }) {
  const { gameId, cards, settings } = useLocal();
  const events = useEvents(gameId);
  const records = [...allRecords(events), ...allRecords(events, 'game')];
  const [draft, setDraft] = useState(() => ({ deckCount: '', decks: [], ...structuredClone(event), matches: event.matches.length ? structuredClone(event.matches) : [createMatch()] }));
  const [step, setStep] = useState('event');
  const [index, setIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const heading = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(() => { dialog.current.scrollTop = 0; heading.current?.focus(); }, [step, index]);
  const field = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const current = draft.matches[index];
  const matchField = (key, value) => setDraft(previous => ({ ...previous, matches: previous.matches.map((match, position) => position === index ? { ...match, [key]: value } : match) }));
  const matchPatch = patch => setDraft(previous => ({ ...previous, matches: previous.matches.map((match, position) => position === index ? { ...match, ...patch } : match) }));
  const next = () => {
    if (!draft.matches[index + 1]) {
      const match = nextMatch(draft, current);
      if (!match) { setStep('rank'); return; }
      setDraft(previous => ({ ...previous, matches: [...previous.matches, match] }));
    }
    setIndex(index + 1);
  };
  const canNext = Boolean(draft.matches[index + 1]) || current.stage !== 'regular' || !draft.rounds || current.round < Number(draft.rounds) || draft.playoff === 'yes';
  const commit = async deleting => {
    if (busy) return;
    setBusy(true); setError('');
    let changed = false;
    try {
      if (deleting) removeEvent(gameId, draft.id); else putEvent(gameId, draft);
      changed = true;
      await flushLibrary();
      if (!deleting) onSaved?.();
      onClose();
    } catch (failure) {
      setError(changed ? '端末に保存できませんでした。入力はこの画面に残っています。空き容量を確認し、もう一度保存してください。' : failure.message);
    } finally { setBusy(false); }
  };
  return <dialog className="mock-settings match-ui match-event-editor" ref={dialog} aria-labelledby="match-record-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={e => { e.preventDefault(); commit(false); }}>
      <fieldset className="match-form-content" disabled={busy}>
      <div className="mock-settings-header"><h2 id="match-record-title">{isNew ? '戦績を記録' : 'イベントを編集'}</h2><button type="button" className="match-secondary" onClick={onClose}>閉じる</button></div>
      <p className="match-optional">すべて任意です。分かるところだけ入力できます。</p>
      <nav className="match-steps" aria-label="戦績入力の手順">{[['event', 'イベント'], ['match', '対戦'], ['rank', '順位']].map(([value, label], position) => <button key={value} type="button" className="match-secondary" aria-current={step === value ? 'step' : undefined} onClick={() => setStep(value)}>{position + 1}. {label}</button>)}</nav>
      <h3 ref={heading} tabIndex={-1} className="match-step-title">{step === 'event' ? 'イベント' : step === 'match' ? matchTitle(current) : '順位'}</h3>
      {step === 'event' && <>
        <div className="match-editor-fields">
          <label className="match-field match-full">イベント名<input value={draft.name} maxLength={80} placeholder="例：店舗大会" onChange={e => field('name', e.target.value)} /></label>
          <DateTimeField value={draft.at} onChange={value => field('at', value)} />
          <label className="match-field">決勝トーナメント<select value={draft.playoff} onChange={e => field('playoff', e.target.value)}><option value="">不明</option><option value="yes">あり</option><option value="no">なし</option></select></label>
          <label className="match-field">{draft.playoff === 'yes' ? '予選何回戦' : '全何回戦'}<input type="number" min="1" step="1" value={draft.rounds} placeholder="不明" onChange={e => field('rounds', e.target.value)} /></label>
          <label className="match-field">対戦形式<input value={draft.format} list="match-format-options" maxLength={80} placeholder="例：BO1、BO3" onChange={e => field('format', e.target.value)} /></label><datalist id="match-format-options">{['BO1', 'BO2', 'BO3', 'BO5'].map(format => <option key={format}>{format}</option>)}</datalist>
          <label className="match-field">使用するデッキ数<input type="number" min="1" step="1" value={draft.deckCount} placeholder="例：2" onChange={e => field('deckCount', e.target.value)} /></label>
          <div className="match-full match-event-decks"><label className="match-field">デッキを登録<select value="" onChange={e => { const deck = savedDecks.find(deck => deck.id === e.target.value); if (deck) field('decks', [...draft.decks, { id: crypto.randomUUID(), ...snapshotDeck(deck, settings.sideDecks) }]); }}><option value="">保存デッキから追加</option>{savedDecks.filter(deck => !draft.decks.some(item => item.deckName === deck.name)).map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label>
            <p className="match-fine">複数登録できます。登録時の構築を残し、各ゲームで使用デッキを選びます。</p>
            {draft.decks.map(deck => <div className="match-registered-deck" key={deck.id}><strong>{deck.deckName}</strong><button type="button" className="match-secondary" aria-label={`${deck.deckName}を登録から外す`} onClick={() => field('decks', draft.decks.filter(item => item.id !== deck.id))}>外す</button></div>)}
          </div>
        </div>
        <p className="match-fine">{draft.playoff === 'yes' ? '予選の回戦数を入力してください。' : '全体の回戦数を入力してください。'}同名でも、新規のイベントは別に記録します。</p>
        <div className="match-actions"><button type="button" onClick={() => setStep('match')}>対戦を入力</button></div>
      </>}
      {step === 'match' && <>
        <div className="match-round-context"><span>{draft.name || 'イベント名不明'}{draft.rounds ? ` · ${draft.playoff === 'yes' ? '予選' : '全'}${draft.rounds}回戦` : ''}{draft.format ? ` · ${draft.format}` : ''}{draft.deckCount ? ` · ${draft.deckCount}デッキ制` : ''}</span></div>
        <div className="match-editor-fields">
          {!current.games?.length && <><RecordedDeckField record={current} decks={draft.decks} savedDecks={savedDecks} settings={settings} onChange={matchPatch} /><OpponentField value={current.opponent} onChange={value => matchField('opponent', value)} savedDecks={savedDecks} records={records} /></>}
          {!!current.games?.length && <p className="match-full match-fine">{recordName(current, 'deckName') || '使用デッキ不明'} ／ 対 {recordName(current, 'opponent') || '相手不明'}</p>}
          <fieldset className="match-results match-full"><legend>マッチの結果</legend>{Object.entries({ '': '不明', ...resultNames }).map(([value, text]) => <label key={value} data-selected={current.result === value}><input type="radio" name="match-result" checked={current.result === value} onChange={() => matchField('result', value)} />{text}</label>)}</fieldset>
        </div>
        <MatchGamesEditor key={current.id} match={current} decks={draft.decks} savedDecks={savedDecks} settings={settings} cards={cards} records={records} onChange={games => matchField('games', games)} />
        <details className="match-more" key={current.id}><summary>対戦の詳細</summary>
          <div className="match-editor-fields">
            <label className="match-field">区分<select value={current.stage} onChange={e => { const stage = e.target.value; setDraft(previous => ({ ...previous, matches: previous.matches.map((match, position) => position === index ? { ...match, stage, round: 1 } : match) })); }}><option value="">不明</option><option value="regular">予選・通常ラウンド</option><option value="playoff">決勝トーナメント</option></select></label>
            <label className="match-field">対戦名<input value={current.label} maxLength={40} placeholder="例：準決勝" onChange={e => matchField('label', e.target.value)} /></label>
            {!current.games?.length && <label className="match-field">先攻・後攻<select value={current.turn} onChange={e => matchField('turn', e.target.value)}>{Object.entries(turnNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            <label className="match-field">ゲームスコア<input value={current.score} maxLength={40} placeholder="例：2-1" onChange={e => matchField('score', e.target.value)} /></label>
            <label className="match-field match-full">メモ<textarea rows={2} maxLength={2000} value={current.memo} onChange={e => matchField('memo', e.target.value)} /></label>
          </div>
          {!!current.games?.length && (current.deckName || current.opponent || current.turn) && <details className="match-more"><summary>ゲーム内訳を追加する前の記録</summary><div className="match-editor-fields"><RecordedDeckField record={current} decks={draft.decks} savedDecks={savedDecks} settings={settings} onChange={matchPatch} /><OpponentField value={current.opponent} onChange={value => matchField('opponent', value)} savedDecks={savedDecks} records={records} /><label className="match-field">先攻・後攻<select value={current.turn} onChange={e => matchField('turn', e.target.value)}>{Object.entries(turnNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><RecordedDeckSnapshot record={current} cards={cards} /></details>}
          {!current.games?.length && <RecordedDeckSnapshot record={current} cards={cards} />}
          <button type="button" className="match-delete" onClick={() => setConfirmDelete('match')}>この対戦を空欄にする</button>
        </details>
        <div className="match-round-nav"><button type="button" className="match-secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>前の対戦</button><span>{index + 1}件目</span><button type="button" onClick={next}>{canNext ? '次の対戦' : '順位へ'}</button></div>
      </>}
      {step === 'rank' && <>
        <div className="match-editor-fields">
          <label className="match-field">予選順位<input value={draft.qualifyingRank} maxLength={40} placeholder="例：3" onChange={e => field('qualifyingRank', e.target.value)} /></label>
          <label className="match-field">最終順位<input value={draft.finalRank} maxLength={40} placeholder="例：1、ベスト8" onChange={e => field('finalRank', e.target.value)} /></label>
        </div>
        <div className="match-actions"><button type="button" className="match-secondary" onClick={() => setStep('match')}>対戦に戻る</button></div>
      </>}
      <div className="match-editor-actions">{!isNew ? <button type="button" className="match-delete" onClick={() => setConfirmDelete('event')}>イベントを削除</button> : <span className="match-fine">途中でも記録できます</span>}<button type="submit">{isNew ? '記録' : '変更を反映'}</button></div>
      {confirmDelete && <div className="match-delete-confirm" role="alert"><p>{confirmDelete === 'event' ? 'このイベントと、含まれる対戦を削除しますか？' : 'この対戦の入力を空欄に戻しますか？'}</p><div className="match-actions"><button type="button" className="match-secondary" onClick={() => setConfirmDelete('')}>キャンセル</button><button type="button" className="match-delete" onClick={() => { if (confirmDelete === 'event') { commit(true); } else { setDraft(previous => ({ ...previous, matches: previous.matches.map((match, position) => position === index ? createMatch(match.stage, match.round) : match) })); setConfirmDelete(''); } }}>{confirmDelete === 'event' ? '削除する' : '空欄にする'}</button></div></div>}
      </fieldset>
      {busy && <p role="status" className="match-fine">保存中…</p>}
      {error && <p role="alert" className="match-error">{error}</p>}
    </form>
  </dialog>;
}
