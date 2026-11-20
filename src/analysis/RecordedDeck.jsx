import { snapshotDeck } from './model.js';

export function RecordedDeckField({ record, decks, savedDecks, settings, onChange }) {
  const choices = decks.length ? decks : savedDecks.map(deck => ({ ...snapshotDeck(deck, settings.sideDecks), id: deck.id }));
  const names = [...new Set([...choices.map(deck => deck.deckName), record.deckName].filter(Boolean))];
  return <label className="match-field">使用デッキ<select value={record.deckName} onChange={event => {
    const deck = choices.find(deck => deck.deckName === event.target.value);
    if (!event.target.value) onChange(snapshotDeck(null));
    else if (deck) { const { id: _id, ...snapshot } = deck; onChange(structuredClone(snapshot)); }
  }}><option value="">不明</option>{names.map(name => <option key={name}>{name}</option>)}</select></label>;
}

export function RecordedDeckSnapshot({ record, cards }) {
  const zones = [{ id: 'main', name: 'メインデッキ', cards: record.cards }, ...(record.sideDeckSettings || []).map(side => ({ ...side, cards: record.sideDecks?.[side.id] || [] }))];
  return <details className="match-snapshot"><summary>対戦時の構築</summary>{zones.filter(zone => zone.cards?.length).map(zone => <section key={zone.id}><h4>{zone.name}</h4><ul>{zone.cards.map(item => {
    const card = cards.find(card => card.id === item.id);
    return <li key={item.id}>{card?.name || card?.front?.name || `カード ${item.id}`}<span>{item.count}枚</span></li>;
  })}</ul></section>)}{!zones.some(zone => zone.cards?.length) && <p className="match-empty">構築の記録はありません。</p>}</details>;
}
