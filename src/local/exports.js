import { expandPrintImages, getPrintLayout } from './cardSize.js';

export async function loadPrintImage(src) {
  const image = new Image();
  const ready = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('カード画像を読み込めませんでした。')); });
  image.src = src;
  await ready;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}

// 画像は元解像度で埋め込み、設定したmm寸法へ直接配置する。
export async function buildPrintPdfs(deck, size, loadImage = loadPrintImage) {
  const { jsPDF } = await import('jspdf');
  const layout = getPrintLayout(size);
  const images = expandPrintImages(deck);
  const data = new Map();
  for (const src of new Set(images)) data.set(src, await loadImage(src));
  const totalPages = Math.ceil(images.length / layout.perPage);
  const files = [];
  const name = (deck.name || 'deck').replace(/[\\/:*?"<>|]/g, '_');
  for (let page = 0; page < totalPages; page++) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < layout.perPage; i++) {
      const src = images[page * layout.perPage + i];
      if (!src) break;
      doc.addImage(data.get(src), layout.x + (i % layout.columns) * layout.width, layout.y + Math.floor(i / layout.columns) * layout.height, layout.width, layout.height);
    }
    files.push({ name: `${name}-${page + 1}_${totalPages}.pdf`, doc });
  }
  return files;
}
