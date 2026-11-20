import { buildDeckSVG } from './deckSvg.js';
import { buildPrintPdfs } from './exports.js';
import { makeDeckJson } from './deckJson.js';
import { allDeckCards } from './sideDecks.js';
import { rehydrateCards } from '../utils/deckUtils.js';

export async function imageData(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error('画像を読み込めませんでした。');
  return blobData(await response.blob());
}
export const blobData = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
});
export async function deckFiles(deck, format, settings, cards) {
  const catalog = new Map(cards.map(card => [card.id, card]));
  if (format === 'json') return [{ name: `${deck.name}.json`, blob: new Blob([JSON.stringify(makeDeckJson(deck, settings, cards), null, 2)], { type: 'application/json' }) }];
  if (format === 'pdf') return (await buildPrintPdfs({ ...deck, cards: rehydrateCards(allDeckCards(deck), catalog) }, settings.cardSize)).map(file => ({ name: file.name, blob: file.doc.output('blob') }));
  const { svg, width, height } = await buildDeckSVG(deck, settings, catalog);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'svg') return [{ name: `${deck.name}-detail.svg`, blob }];
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = width * 4; canvas.height = height * 4;
    const ctx = canvas.getContext('2d'); ctx.setTransform(4, 0, 0, 4, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, 0, 0, width, height);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNGを作成できませんでした。');
    return [{ name: `${deck.name}.png`, blob: png }];
  } finally { URL.revokeObjectURL(url); }
}
