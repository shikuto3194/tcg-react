import { useEffect, useRef, useState } from 'react';
import { sideLabel } from '../local/sideDecks.js';
import './deckZones.css';

// Measure the space left beside the view toggles before folding the side buttons.
export default function DeckZoneButtons({ zones, selected, onSelect }) {
  const container = useRef(null), probe = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const selectedSide = zones.slice(1).find(zone => zone.id === selected);
  const render = (zone, measuring = false) => <button type="button" key={zone.id} className={`view-toggle-btn side-mode-btn${selected === zone.id ? ' active' : ''}`} title={zone.name} style={{ '--zone-color': zone.color }} aria-label={`増減先：${zone.name}`} aria-pressed={selected === zone.id} onClick={event => { onSelect(selected === zone.id ? 'main' : zone.id); const menu = event.currentTarget.closest('details'); if (menu) menu.open = false; }} tabIndex={measuring ? -1 : undefined}>{sideLabel(zone.name)}</button>;
  useEffect(() => {
    const measure = () => setCollapsed(probe.current.scrollWidth > container.current.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container.current); observer.observe(probe.current);
    return () => observer.disconnect();
  }, [zones]);
  return <div className="deck-zones deck-zone-selector" ref={container} aria-label="カードの増減先" onClick={event => event.stopPropagation()}>
    <div className="zone-probe" ref={probe} aria-hidden="true" inert>{zones.slice(1).map(zone => render(zone, true))}</div>
    {(collapsed || zones.length > 4) && zones.length > 1 ? <details className="zone-overflow"><summary aria-label="サイドデッキのボタンを表示" className={`view-toggle-btn side-mode-btn${selectedSide ? ' active' : ''}`} style={{ '--zone-color': selectedSide?.color || zones[1].color }}>{selectedSide ? ` ${sideLabel(selectedSide.name)}` : ''}</summary><div>{zones.slice(1).map(zone => render(zone))}</div></details> : zones.slice(1).map(zone => render(zone))}
  </div>;
}
