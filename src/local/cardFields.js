// 表示名を変えても、既存のカード・デッキが参照するキーは変えない。
export const fieldKeys = ['color', 'type', 'rarity', 'tribe', 'cost', 'reduction'];
export const keyAt = number => [...fieldKeys, 'symbol'][number - 1] || `item${number}`;
export const numberOf = key => [...fieldKeys, 'symbol'].includes(key) ? [...fieldKeys, 'symbol'].indexOf(key) + 1 : Number(key.slice(4));
export const keysOf = settings => settings.fieldKeys || settings.labels.map((_, i) => keyAt(i + 1));
export function validateFields(settings) {
  if (!Array.isArray(settings.labels) || settings.labels.length > 100 || settings.labels.some(label => typeof label !== 'string')) throw new Error('項目の設定を確認してください。');
  const keys = keysOf(settings);
  if (!Array.isArray(keys) || keys.length !== settings.labels.length || new Set(keys).size !== keys.length || keys.some(key => typeof key !== 'string' || !Number.isInteger(numberOf(key)) || numberOf(key) < 1 || numberOf(key) > 100 || keyAt(numberOf(key)) !== key)) throw new Error('項目の設定を確認してください。');
  if (settings.source !== 'folder' && !keys.includes(settings.source)) throw new Error('セット名に使う項目を選んでください。');
  return keys;
}
export const fieldInUse = (cards, key, source) => source === key || cards.some(card => (card.isDoubleSided ? [card.front, card.back] : [card]).some(face => valueOf(face, key).trim() !== ''));
export function addField(settings, number) {
  const keys = keysOf(settings);
  const next = number ?? Array.from({ length: 100 }, (_, i) => i + 1).find(i => !keys.includes(keyAt(i)));
  if (!next || keys.length >= 100) throw new Error('項目は100個までです。');
  return { ...settings, fieldKeys: [...keys, keyAt(next)], labels: [...settings.labels, `項目${next}`] };
}
export const fieldsOf = card => card.front || card;
export const valueOf = (card, key) => {
  const value = fieldsOf(card)[key];
  return Array.isArray(value) ? value.join('・') : String(value ?? '');
};
