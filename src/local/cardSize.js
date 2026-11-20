export const DEFAULT_CARD_SIZE = Object.freeze({ width: 60, height: 87 });
export const IMAGE_UNITS_PER_MM = 2;

export function normalizeCardSize(size = DEFAULT_CARD_SIZE) {
  const width = Number(size.width), height = Number(size.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 190 || height > 277) {
    throw new Error('カードサイズは幅1〜190mm、高さ1〜277mmで入力してください。');
  }
  return { width, height };
}
export function getPrintLayout(size) {
  const { width, height } = normalizeCardSize(size);
  const columns = Math.floor((190 + 1e-8) / width);
  const rows = Math.floor((277 + 1e-8) / height);
  return { width, height, columns, rows, perPage: columns * rows, x: (210 - columns * width) / 2, y: (297 - rows * height) / 2 };
}
export function getImageLayout(size) {
  const { width, height } = normalizeCardSize(size);
  return { cellW: width * IMAGE_UNITS_PER_MM + 8, cellH: height * IMAGE_UNITS_PER_MM + 8, thumbW: 48, thumbH: 48 * height / width };
}
// 採用数を間引かない。両面は1枚につき表・裏を各1画像配置する。
export function expandPrintImages(deck) {
  const images = [];
  for (const card of deck.cards || []) {
    const count = Number(card.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('カード枚数は0以上の整数にしてください。');
    const faces = card.isDoubleSided ? [card.front, card.back] : [card];
    if (count && faces.some(face => !face?.image)) throw new Error('画像が見つからないカードがあります。');
    for (let i = 0; i < count; i++) for (const face of faces) images.push(face.image);
  }
  if (!images.length) throw new Error('デッキにカードがありません。');
  return images;
}
