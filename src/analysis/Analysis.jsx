import { useState } from 'react';
import { useLocal, useEvents } from '../local/store.js';
import EventEditor from './EventEditor.jsx';
import ResultsChart from './ResultsChart.jsx';
import { allRecords, eventLabels, filterEvents, formatDateTime, groupRecords, matchTitle, rankText, recordName, recordNames, recordText, resultNames, turnNames, winRate } from './model.js';

export default function Analysis({ savedDecks, isLandscape }) {
  const { gameId, name } = useLocal();
  const events = useEvents(gameId);
  const records = [...allRecords(events), ...allRecords(events, 'game')];
  const [filters, setFilters] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const group = filters.group || '';
  const unit = filters.unit || 'match';
  const [editing, setEditing] = useState(null);
  const [shown, setShown] = useState(10);
  const [order, setOrder] = useState('date');
  const updateFilter = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setShown(10); };
  const filteredEvents = filterEvents(events, filters);
  const filtered = filteredEvents.flatMap(event => event.matched).filter(row => Object.hasOwn(resultNames, row.result));
  const groups = group ? groupRecords(filtered, group) : filtered.length ? [['all', filtered]] : [];
  const groupedCount = groups.reduce((sum, [, rows]) => sum + rows.length, 0);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const invalidRange = filters.from && filters.to && filters.from > filters.to;
  const labels = eventLabels(events);
  const deckNames = [...new Set([...savedDecks.map(deck => deck.name), ...records.flatMap(row => recordNames(row, 'deckName'))].filter(Boolean))];
  const opponents = [...new Set(records.flatMap(row => recordNames(row, 'opponent')))];
  const formats = [...new Set(events.map(event => event.format).filter(Boolean))];
  const deckCounts = [...new Set(events.map(event => event.deckCount).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  const groupingNames = { opponent: '相手のデッキ', event: 'イベント', deck: '使用デッキ', turn: '先攻・後攻' };
  const history = [...filteredEvents].sort((a, b) => {
    if (order === 'date') return b.at.localeCompare(a.at);
    const rank = event => /^\d+$/.test(event[order]) ? Number(event[order]) : Infinity;
    return rank(a) - rank(b) || b.at.localeCompare(a.at);
  });
  return <>
    <div className="tab-controls match-ui match-analysis-controls">
      <h2>{name}</h2>
      <div className="match-filter-heading"><button type="button" aria-expanded={filtersOpen} aria-controls="analysis-filters" onClick={() => setFiltersOpen(!filtersOpen)}>{filtersOpen ? (isLandscape ? '閉じる' : 'フィルターを閉じる') : (isLandscape ? 'フィルター' : 'フィルターを開く')}</button><button type="button" className="match-filter-reset" onClick={() => { setFilters({}); setShown(10); }}>{isLandscape ? 'リセット' : '条件リセット'}</button></div>
      {activeCount > 0 && <p className="match-fine match-filter-status" role="status">{activeCount}条件を適用中</p>}
      <div id="analysis-filters" className="filter-row match-filter-fields" hidden={!filtersOpen}>
        <label className="match-field">集計単位<select value={unit} onChange={e => updateFilter('unit', e.target.value === 'match' ? '' : e.target.value)}><option value="match">マッチ</option><option value="game">ゲーム</option></select></label>
        <label className="match-field">使用するデッキ数<select value={filters.deckCount || ''} onChange={e => updateFilter('deckCount', e.target.value)}><option value="">すべて</option>{deckCounts.map(count => <option key={count} value={count}>{count}デッキ制</option>)}</select></label>
        <label className="match-field">開始日<input type="date" value={filters.from || ''} onChange={e => updateFilter('from', e.target.value)} /></label><label className="match-field">終了日<input type="date" value={filters.to || ''} onChange={e => updateFilter('to', e.target.value)} /></label>
        {invalidRange && <p className="match-error match-full" role="alert">終了日は開始日以降にしてください。</p>}
        <label className="match-field">イベント<select value={filters.eventId || ''} onChange={e => updateFilter('eventId', e.target.value)}><option value="">すべて</option>{events.map(event => <option key={event.id} value={event.id}>{labels.get(event.id)}</option>)}</select></label>
        <label className="match-field">対戦形式<select value={filters.format || ''} onChange={e => updateFilter('format', e.target.value)}><option value="">すべて</option>{formats.map(format => <option key={format}>{format}</option>)}</select></label>
        <label className="match-field">使用デッキ<select value={filters.deck || ''} onChange={e => updateFilter('deck', e.target.value)}><option value="">すべて</option>{deckNames.map(deck => <option key={deck}>{deck}</option>)}</select></label>
        <label className="match-field">相手のデッキ<select value={filters.opponent || ''} onChange={e => updateFilter('opponent', e.target.value)}><option value="">すべて</option>{opponents.map(opponent => <option key={opponent}>{opponent}</option>)}</select></label>
        <label className="match-field">結果<select value={filters.result || ''} onChange={e => updateFilter('result', e.target.value)}><option value="">すべて</option>{Object.entries(resultNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="unknown">不明</option></select></label>
        <label className="match-field">先攻・後攻<select value={filters.turn || ''} onChange={e => updateFilter('turn', e.target.value)}><option value="">すべて</option><option value="first">先攻</option><option value="second">後攻</option><option value="unknown">不明</option></select></label>
        <label className="match-field match-full">集計<select value={group} onChange={e => updateFilter('group', e.target.value)}><option value="">条件なし</option>{Object.entries(groupingNames).map(([value, label]) => <option key={value} value={value}>{label}別</option>)}</select></label>
      </div>
    </div>
    <div className="tab-results match-ui match-analysis-results">
      <p className="match-analysis-summary" aria-live="polite">{filtered.length}{unit === 'game' ? 'ゲーム' : 'マッチ'}<span>{recordText(filtered)}</span><span>勝率 {winRate(filtered)}</span></p>
      <ResultsChart records={filtered} from={filters.from} to={filters.to} />
      {groups.length ? <table className="match-table"><thead><tr><th>{groupingNames[group] || '集計'}</th><th>対戦数</th><th>割合</th><th>勝／敗／分</th><th>勝率</th></tr></thead><tbody>{groups.map(([key, rows]) => <tr key={key}><th scope="row">{!group ? '全体' : group === 'event' ? labels.get(key) : key}</th><td>{rows.length}</td><td>{Math.round(rows.length / groupedCount * 100)}%</td><td>{recordText(rows).replaceAll('勝 ', '／').replaceAll('敗 ', '／').replace('分', '')}</td><td>{winRate(rows)}</td></tr>)}</tbody></table> : <p className="match-empty">この条件で集計できる戦績はありません。</p>}
      <p className="match-fine">不明な項目は該当する集計から除外します。勝敗不明の対戦は集計せず、勝率は引き分けも除きます。</p>
      <p className="match-fine">{unit === 'game' ? 'ゲーム内訳を入力した記録だけを集計します。' : 'マッチ全体の結果を集計します。複数デッキは組み合わせとして表示します。各デッキのゲーム勝率は「集計単位」でゲームを選んでください。'}</p>
      <div className="match-history-heading"><h2>履歴 · {filteredEvents.length}イベント</h2><label className="match-field">表示順<select value={order} onChange={e => setOrder(e.target.value)}><option value="date">開催日順</option><option value="finalRank">最終順位順</option><option value="qualifyingRank">予選順位順</option></select></label></div>
      <div className="match-history">{history.slice(0, shown).map(event => <article className="match-event-history" key={event.id}>
        <div className="match-event-heading"><div><strong>{event.name || 'イベント名不明'}</strong><time dateTime={event.at || undefined}>{formatDateTime(event.at)}</time></div><button type="button" className="match-secondary" aria-label={`${labels.get(event.id)}を編集`} onClick={() => setEditing(events.find(item => item.id === event.id))}>編集・追記</button></div>
        <div className="match-event-ranks"><span>予選順位<strong>{rankText(event.qualifyingRank)}</strong></span><span>最終順位<strong>{rankText(event.finalRank)}</strong></span></div>
        <p className="match-event-meta">{event.rounds ? `${event.playoff === 'yes' ? '予選' : '全'}${event.rounds}回戦` : '回戦数不明'}{event.playoff === 'yes' ? ' ＋ 決勝トーナメント' : ''} · {event.format || '対戦形式不明'}{event.deckCount ? ` · ${event.deckCount}デッキ制` : ''}</p>
        <details className="match-event-matches"><summary>{unit === 'game' ? 'ゲーム' : '対戦'}を見る（{event.matched.length}件）</summary>{event.matched.length ? event.matched.map(row => <div className="match-history-row" key={row.id}><span className={`match-result-label ${row.result}`}>{resultNames[row.result] || '不明'}</span><div className="match-history-body"><strong>{matchTitle(row)}{row.score ? ` · ${row.score}` : ''}</strong><span>{recordName(row, 'deckName') || '使用デッキ不明'} ／ 対 {recordName(row, 'opponent') || '相手不明'}</span><span>{row.games?.length ? '' : turnNames[row.turn]}{row.memo ? ` · ${row.memo}` : ''}</span>{!!row.games?.length && <details className="match-game-history"><summary>ゲーム内訳（{recordText(row.games)}）</summary>{row.games.map((game, index) => <p key={game.id}>第{index + 1}ゲーム · {resultNames[game.result] || '結果不明'}<br />{game.deckName || '使用デッキ不明'} ／ 対 {game.opponent || '相手不明'} · {turnNames[game.turn]}{game.memo ? ` · ${game.memo}` : ''}</p>)}</details>}</div></div>) : <p className="match-empty">対戦の入力はありません。</p>}</details>
      </article>)}</div>
      {!filteredEvents.length && <p className="match-empty">この条件のイベントはありません。</p>}
      {filteredEvents.length > shown && <button type="button" className="match-secondary" onClick={() => setShown(shown + 10)}>続きを表示</button>}
    </div>
    {editing && <EventEditor key={editing.id} event={editing} savedDecks={savedDecks} onClose={() => setEditing(null)} />}
  </>;
}
