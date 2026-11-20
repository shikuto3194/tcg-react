import { getImageLayout, IMAGE_UNITS_PER_MM } from './cardSize.js';
import { allDeckCards, sidesOf } from './sideDecks.js';
import { sortDeckCards, rehydrateCards } from '../utils/deckUtils.js';

export async function loadImageDataUrl(src) {
  if (!src) throw new Error('画像が見つからないカードがあります。');
  try {
    const res = await fetch(src, { cache: 'no-cache' });
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const reader = new FileReader();
    const done = new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
    });
    reader.readAsDataURL(blob);
    return await done; // data:image/png;base64,...
  } catch {
    throw new Error('カード画像を読み込めず、ファイルを作成できませんでした。');
  }
}

export async function buildDeckSVG(deckObj, settings, catalog, toDataUrl = loadImageDataUrl) {
  if (!deckObj || !Array.isArray(deckObj.cards)) return null;
  const cards = sortDeckCards(rehydrateCards(deckObj.cards, catalog));
  const allCards = rehydrateCards(allDeckCards(deckObj), catalog);
  const thumbnail = allCards.find(card => card.id === deckObj.thumbnailCardId) || allCards.find(card => card.isDeckThumbnail) || allCards[0];
  const thumbnailSrc = deckObj.thumbnail || (thumbnail?.isDoubleSided ? thumbnail.front.image : thumbnail?.image);
  // レイアウト設定
  const cols = 5;
  const { cellW, cellH, thumbW, thumbH } = getImageLayout(settings.cardSize);
  const gap = 12;
  const marginLeft = 24;
  const marginTop = 24;
  const headerH = Math.max(90, thumbH + 16);
  const rows = Math.ceil(cards.length / cols);

  const escapeText = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const sideGroups = (settings.sideDecks || []).map(zone => ({ ...zone, cards: sortDeckCards(rehydrateCards(sidesOf(deckObj)[zone.id] || [], catalog)) })).filter(zone => zone.cards.length);
  const svgW = marginLeft + cols * cellW + (cols - 1) * gap + marginLeft;
  const sectionHeight = count => Math.ceil(count / cols) * (cellH + gap);
  const svgH = marginTop + headerH + sectionHeight(cards.length) + sideGroups.reduce((sum, zone) => sum + 40 + sectionHeight(zone.cards.length), 0) + marginTop;

  // ヘッダー（タイトル、サムネイル、合計枚数）
  const header = (() => {
    const nameText = String(deckObj.name || 'デッキ').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const mainTotal = cards.reduce((s, c) => s + (c.count || 0), 0);
    const sideTotal = sideGroups.reduce((sum, zone) => sum + zone.cards.reduce((n, card) => n + card.count, 0), 0);
    const thumbSrc = thumbnailSrc;
    // 同期文字列生成のため、後で置換
    const thumbImgPlaceholder = '<!--THUMB_PLACEHOLDER-->';
    const titleX = marginLeft + (thumbSrc ? 64 : 0);
    return `
      ${thumbImgPlaceholder}
      <text x="${titleX}" y="${marginTop + 26}" font-size="22" font-weight="700" fill="#000">${nameText}</text>
      <text x="${titleX}" y="${marginTop + 56}" font-size="16" font-weight="700">
        <tspan fill="#1976d2">メインデッキ${mainTotal}枚</tspan>
        ${sideTotal > 0 ? `<tspan fill="#945000"> サイド合計${sideTotal}枚</tspan>` : ''}
      </text>
    `;
  })();

  // カードグリッドSVG作成
  const gridStartY = marginTop + headerH;
  // 後で画像を埋め込むためにプレースホルダーを使う
  const imgPlaceholders = [];
  const items = cards.map((card, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const x = marginLeft + c * (cellW + gap);
    const y = gridStartY + r * (cellH + gap);
    const display = card.isDoubleSided && card.front ? card.front : card;
    const imgX = x + 4;
    const imgY = y + 4;
    const imgW = cellW - 8;
    const imgH = cellH - 8;
    const placeholderId = `IMG_${idx}`;
    imgPlaceholders.push({ id: placeholderId, src: display.image, x: imgX, y: imgY, w: imgW, h: imgH });
    // バッジ（右上）
    const badgeR = 12;
    const badgeCx = x + cellW - badgeR - 6;
    const badgeCy = y + badgeR + 6;
    return `
      <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="6" ry="6" fill="#ffffff" stroke="#bbb" />
      <!--${placeholderId}-->
      <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}" fill="#1976d2" />
      <text x="${badgeCx}" y="${badgeCy + 5}" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${card.count || 0}</text>
    `;
  }).join('');

  let sideY = gridStartY + rows * (cellH + gap);
  const tokensSection = sideGroups.map((zone, zoneIndex) => {
    sideY += 40;
    const heading = `<text x="${marginLeft}" y="${sideY - 12}" font-size="18" font-weight="700" fill="${zone.color}">${escapeText(zone.name)} (${zone.cards.reduce((sum, card) => sum + card.count, 0)}枚)</text>`;
    const items = zone.cards.map((card, index) => {
      const x = marginLeft + (index % cols) * (cellW + gap), y = sideY + Math.floor(index / cols) * (cellH + gap);
      const face = card.isDoubleSided ? card.front : card;
      const id = `SIDE_${zoneIndex}_${index}`;
      imgPlaceholders.push({ id, src: face.image, x: x + 4, y: y + 4, w: cellW - 8, h: cellH - 8 });
      return `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="6" fill="#fff" stroke="#bbb" /><!--${id}--><circle cx="${x + cellW - 18}" cy="${y + 18}" r="12" fill="${zone.color}" /><text x="${x + cellW - 18}" y="${y + 23}" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${card.count}</text>`;
    }).join('');
    sideY += sectionHeight(zone.cards.length);
    return heading + items;
  }).join('');

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgW / IMAGE_UNITS_PER_MM}mm" height="${svgH / IMAGE_UNITS_PER_MM}mm" viewBox="0 0 ${svgW} ${svgH}">
      <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#ffffff" />
      ${header}
      ${items}
      ${tokensSection}
    </svg>`;

  // サムネイル差し込み
  const headerThumbSrc = thumbnailSrc;
  if (headerThumbSrc) {
    const thumbDataUrl = await toDataUrl(headerThumbSrc);
    if (thumbDataUrl) {
      const thumbTag = `<image href="${thumbDataUrl}" x="${marginLeft}" y="${marginTop}" width="${thumbW}" height="${thumbH}" preserveAspectRatio="none" />`;
      svg = svg.replace('<!--THUMB_PLACEHOLDER-->', thumbTag);
    } else {
      svg = svg.replace('<!--THUMB_PLACEHOLDER-->', '');
    }
  } else {
    svg = svg.replace('<!--THUMB_PLACEHOLDER-->', '');
  }

  // 各カード画像差し込み
  for (const ph of imgPlaceholders) {
    const dataUrl = await toDataUrl(ph.src);
    const tag = dataUrl
      ? `<image href="${dataUrl}" x="${ph.x}" y="${ph.y}" width="${ph.w}" height="${ph.h}" preserveAspectRatio="none" />`
      : '';
    svg = svg.replace(`<!--${ph.id}-->`, tag);
  }

  return { svg, width: svgW, height: svgH };
}
