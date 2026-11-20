import { fieldLabel, useLocal, keysOf } from '../local/store.js';
import { useId } from 'react';
import { DECK_FILTER_LABELS } from '../utils/savedDeckFilters';
import '../styles/saved-deck-filters.css';

export default function SavedDeckFilters({ filters, options, onChange, children }) {
  const { settings } = useLocal();
  const labels = { ...DECK_FILTER_LABELS, type: fieldLabel('type'), color: fieldLabel('color'), tribe: fieldLabel('tribe'), pack: '収録セット' };
  const id = useId();
  return (
    <div className="saved-deck-filters">
      {Object.entries(labels).map(([field, label]) => {
        if (field !== 'pack' && !keysOf(settings).includes(field)) return null;
        const searchable = field === 'tribe' || field === 'type';
        const choices = options[field];
        return (
          <label key={field} className="saved-deck-filter-field">
            <span>{label}</span>
            {searchable ? (
              <>
                <input type="search" list={`${id}-${field}`} aria-label={`デッキの${label}`} placeholder="指定なし・入力で検索"
                  value={filters[field]} onChange={event => onChange({ ...filters, [field]: event.target.value })} />
                <datalist id={`${id}-${field}`}>
                  {choices.map(option => <option key={option.value} value={option.value}>{option.count}デッキ</option>)}
                </datalist>
              </>
            ) : (
              <select aria-label={`デッキの${label}`} value={filters[field]} onChange={event => onChange({ ...filters, [field]: event.target.value })}>
                <option value="">指定なし</option>
                {filters[field] && !choices.some(option => option.value === filters[field]) && <option value={filters[field]}>{filters[field]}（0デッキ）</option>}
                {choices.map(option => <option key={option.value} value={option.value}>{option.value}（{option.count}デッキ）</option>)}
              </select>
            )}
          </label>
        );
      })}
      {children}
    </div>
  );
}
