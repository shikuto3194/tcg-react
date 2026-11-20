import { useState } from 'react';
import { dailyResults } from './model.js';

const dayTime = day => Date.parse(`${day}T00:00:00Z`);
const dayLabel = day => day.replaceAll('-', '/');

export default function ResultsChart({ records, from = '', to = '', title = '勝率の推移' }) {
  const days = dailyResults(records, { from, to });
  const [selected, setSelected] = useState('');
  const current = days.find(day => day.day === selected);
  const start = from || days[0]?.day || to;
  const end = to || days.at(-1)?.day || from;
  const validRange = start && end && start <= end;
  const span = validRange ? (dayTime(end) - dayTime(start)) / 86400000 : 0;
  const x = day => span ? 48 + (dayTime(day) - dayTime(start)) / 86400000 / span * 562 : 329;
  const rate = day => day.win + day.loss ? day.win / (day.win + day.loss) * 100 : null;
  const y = day => 150 - rate(day) * 1.25;
  const points = days.filter(day => rate(day) !== null);
  const ticks = validRange ? [...new Set(Array.from({ length: 5 }, (_, index) => new Date(dayTime(start) + Math.round(span * index / 4) * 86400000).toISOString().slice(0, 10)))] : [];
  const describe = day => `${dayLabel(day.day)}：勝率 ${rate(day) === null ? '—' : `${Math.round(rate(day))}%`}（${day.win}勝 ${day.loss}敗 ${day.draw}分）`;
  const period = validRange ? start === end ? dayLabel(start) : `${dayLabel(start)}〜${dayLabel(end)}` : '';
  return <section className="match-chart" aria-label={`${title}グラフ`}>
    <h2>{title}</h2>
    <p className="match-chart-legend"><span style={{ color: '#1976d2' }}>● 日ごとの勝率</span><span>引き分けを除く</span>{period && <span>{period}</span>}</p>
    <svg viewBox="0 0 620 180" role="group" aria-label={`${period ? `${period}。` : ''}日付を選ぶと勝率と勝敗の内訳を表示します。`}>
      {[0, 50, 100].map(value => <g key={value}><line x1="48" x2="610" y1={150 - value * 1.25} y2={150 - value * 1.25} stroke="#d6dce2" /><text x="40" y={154 - value * 1.25} textAnchor="end" fontSize="12" fill="#555">{value}%</text></g>)}
      {current && <line x1={x(current.day)} x2={x(current.day)} y1="20" y2="155" stroke="#c0cfdf" />}
      <polyline points={points.map(day => `${x(day.day)},${y(day)}`).join(' ')} fill="none" stroke="#1976d2" strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />
      {days.map((day, index) => {
        const left = index ? (x(days[index - 1].day) + x(day.day)) / 2 : 48;
        const right = index < days.length - 1 ? (x(day.day) + x(days[index + 1].day)) / 2 : 610;
        return <g key={day.day} role="button" tabIndex="0" aria-label={describe(day)} aria-pressed={selected === day.day} onClick={() => setSelected(day.day)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(day.day); } }}>
          <title>{describe(day)}</title><rect x={left} y="18" width={right - left} height="138" fill="transparent" />
          {rate(day) !== null ? <circle cx={x(day.day)} cy={y(day)} r={selected === day.day ? 5 : 3.5} fill="#1976d2" /> : <line x1={x(day.day)} x2={x(day.day)} y1="151" y2="156" stroke="#89969f" />}
        </g>;
      })}
      {ticks.map((day, index) => <text key={day} x={x(day)} y="173" textAnchor={ticks.length === 1 ? 'middle' : index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'} fontSize="12" fill="#555" pointerEvents="none">{start.slice(0, 4) === end.slice(0, 4) ? dayLabel(day).slice(5) : dayLabel(day)}</text>)}
    </svg>
    <p className="match-fine" aria-live="polite">{current ? describe(current) : points.length ? '日付を選ぶと勝率と内訳を表示します。' : 'この期間に勝率を計算できる対戦はありません。'}</p>
  </section>;
}
