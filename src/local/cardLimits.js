// The empty value means unlimited; zero explicitly forbids adding copies.
export const getLocalLimit = card => card?.mockLimit === '' || card?.mockLimit == null ? Infinity : Number(card.mockLimit);
export function validateLimit(value) {
  if (value === '' || value == null) return '';
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('採用上限は0以上の整数、または空欄にしてください。');
  return String(value);
}
