import { keysOf, valueOf } from './cardFields.js';
import { isTextField, NEUTRAL_PALETTE, palettesFor, selectArtworkField } from './cardVocabulary.js';

const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const segments = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const glyphs = text => [...segments.segment(text)].map(item => item.segment);
// 和文を基準に幅を確保し、欧文・数値は少し詰める。SVG側にも同じ幅を渡す。
const glyphUnits = char => /^[\x20-\x7e]$/.test(char) ? (/[MW@%]/.test(char) ? 0.95 : 0.62) : 1;
const units = text => glyphs(text).reduce((sum, char) => sum + glyphUnits(char), 0);
const cannotStart = /^[、。，．！？：；）］｝」』】〉》ーぁぃぅぇぉっゃゅょ]/;
const cannotEnd = /[（［｛「『【〈《]$/;

export function wrapArtworkText(text, width, fontSize) {
  const lines = [];
  for (const paragraph of String(text).replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n')) {
    let remaining = glyphs(paragraph);
    if (!remaining.length) lines.push('');
    while (remaining.length) {
      let end = 0, length = 0;
      while (end < remaining.length && length + glyphUnits(remaining[end]) <= width / fontSize) length += glyphUnits(remaining[end++]);
      end = Math.max(1, end);
      if (end < remaining.length) {
        // 欧文の単語をなるべく保ち、長い単語はカード幅で折り返す。
        const space = remaining.slice(0, end).lastIndexOf(' ');
        if (/^[a-z0-9]$/i.test(remaining[end]) && space > end / 2) end = space + 1;
        while (end > 1 && (cannotStart.test(remaining[end] || '') || cannotEnd.test(remaining[end - 1]))) end--;
      }
      lines.push(remaining.slice(0, end).join(''));
      remaining = remaining.slice(end);
    }
  }
  return lines;
}

function fitText(text, box, maximum, minimum, lineHeight = 1.45) {
  for (let size = maximum; size >= minimum; size--) {
    const lines = wrapArtworkText(text, box.w, size);
    if (lines.length * size * lineHeight <= box.h) return { ...box, lines, size, lineHeight, fits: true };
  }
  return { ...box, lines: [], size: minimum, lineHeight, fits: false };
}

function wrapMetadata(items, width, size) {
  const lines = [];
  let line = '';
  for (const item of items) {
    const joined = line ? `${line}  /  ${item}` : item;
    if (units(joined) * size <= width && !joined.includes('\n')) { line = joined; continue; }
    if (line) lines.push(line);
    const wrapped = wrapArtworkText(item, width, size);
    lines.push(...wrapped.slice(0, -1));
    line = wrapped.at(-1);
  }
  if (line) lines.push(line);
  return lines;
}

export function artworkData(face, settings) {
  const fields = keysOf(settings).map((key, i) => ({ key, label: settings.labels[i], value: valueOf(face, key).trim() }));
  const role = name => {
    const labeled = selectArtworkField(fields, name, settings.gameName);
    if (labeled) return labeled;
    // 未命名の標準欄だけを補助に使う。改名された無関係な項目を流用しない。
    return fields.find(field => field.key === ({ cost: 'cost', power: 'reduction' })[name] && /^項目\d+$/.test(field.label) && /^[+−-]?[\d,.]+$/.test(field.value));
  };
  // 名前が項目Nのままなら、色名・属性名だけを完全一致で拾う。本文やカード名では推定しない。
  const color = role('color')?.value || fields.find(field => /^項目\d+$/.test(field.label) && palettesFor(field.value, settings.gameName).length)?.value || '';
  const colors = palettesFor(color, settings.gameName);
  const cost = role('cost'), power = role('power'), title = role('name');
  const textFields = fields.filter(field => field.value && isTextField(field));
  const assigned = new Set([cost?.key, power?.key, title?.key, ...textFields.map(field => field.key)]);
  const metadata = fields.filter(field => field.value && !assigned.has(field.key)).map(field => `${field.label}：${field.value}`);
  if (title && title.value !== face.name) metadata.unshift(`登録名：${face.name}`);
  if (face.pack && !fields.some(field => field.key === settings.source && field.value === face.pack)) metadata.push(`収録セット：${face.pack}`);
  if (face.cardNumber) metadata.push(`カード番号：${face.cardNumber}`);
  const body = textFields.map(field => `${field.label}：${field.value}`);
  if (face.effect) body.push(textFields.length ? `テキスト：${face.effect}` : face.effect);
  return { cost, power, title: title?.value || face.name, body: body.join('\n'), metadata: metadata.join('  /  '), metadataItems: metadata, colors: colors.length ? colors : [NEUTRAL_PALETTE] };
}

export function layoutArtwork(face, settings) {
  const width = 750, height = width * settings.cardSize.height / settings.cardSize.width;
  const scale = Math.min(width, height) / 750, margin = 50 * scale;
  const contentWidth = width - margin * 2;
  const data = artworkData(face, settings);
  let name, body, metadata, divider = height * 0.5;
  const metaLines = wrapMetadata(data.metadataItems, contentWidth, 24 * scale);
  const metaHeight = metaLines.length * 24 * scale * 1.4;
  // 本文が入る間は配置・文字サイズを維持。長文だけ本文を上へ延ばす。
  // 名前が収まる範囲で領域を譲り、それでも必要な場合だけ本文の文字を縮める。
  outer: for (let size = 30 * scale; size >= 23 * scale; size -= scale) {
    for (let step = 0; step <= 18; step++) {
      const shift = height * step / 100;
      divider = height * 0.5 - shift;
      metadata = { x: margin, y: divider - 22 * scale - metaHeight, w: contentWidth, h: metaHeight, lines: metaLines, size: 24 * scale, lineHeight: 1.4, fits: true };
      name = fitText(data.title, { x: margin, y: height * 0.19, w: contentWidth, h: metadata.y - height * 0.19 - 20 * scale }, 55 * scale, 32 * scale, 1.3);
      body = fitText(data.body, { x: margin, y: height * 0.54 - shift, w: contentWidth, h: height * 0.34 + shift }, size, size);
      if (name.fits && body.fits) break outer;
    }
  }
  const cost = data.cost ? fitText(`${data.cost.label}  ${data.cost.value}`, { x: margin, y: 39 * scale, w: contentWidth * 0.65, h: height * 0.12 }, 30 * scale, 23 * scale, 1.3) : null;
  const power = data.power ? fitText(`${data.power.label}  ${data.power.value}`, { x: margin, y: height * 0.91, w: contentWidth, h: height * 0.065 }, 36 * scale, 23 * scale, 1.2) : null;
  return { width, height, scale, margin, divider, data, name, body, metadata, cost, power };
}

export function validateArtwork(face, settings) {
  if (face.image) return;
  if ([face.name, face.effect, face.cardNumber, face.pack, ...keysOf(settings).map(key => valueOf(face, key))].join('').length > 20000) throw new Error('画像なしカードの名前・項目・テキストを短くしてください。');
  const layout = layoutArtwork(face, settings);
  for (const [key, label] of [['body', 'テキスト'], ['name', 'カード名・項目情報'], ['cost', 'コストの項目'], ['power', 'パワーの項目']]) {
    if (layout[key] && !layout[key].fits) throw new Error(`「${face.name}」の${label}がカード内に収まりません。短くするか、ゲーム設定でカードサイズを変えてください。`);
  }
}

function textBlock(block, { align = 'start', weight = 400, color = '#263036', center = false } = {}) {
  if (!block) return '';
  const x = block.x + (align === 'middle' ? block.w / 2 : align === 'end' ? block.w : 0);
  const top = block.y + (center ? (block.h - block.lines.length * block.size * block.lineHeight) / 2 : 0);
  return block.lines.map((line, index) => `<text x="${x}" y="${top + block.size + index * block.size * block.lineHeight}" font-size="${block.size}" font-weight="${weight}" fill="${color}" text-anchor="${align}"${line ? ` textLength="${Math.min(block.w, units(line) * block.size)}" lengthAdjust="spacingAndGlyphs"` : ''}>${escapeXml(line)}</text>`).join('');
}

export function createCardArtwork(face, settings) {
  const { width, height, scale, margin, divider, data, name, body, metadata, cost, power } = layoutArtwork(face, settings);
  const [ink, paper] = data.colors[0];
  const gradient = data.colors.length === 1 ? `<stop stop-color="${paper}"/><stop offset="1" stop-color="${paper}"/>` : data.colors.map((palette, i) => `<stop offset="${i / (data.colors.length - 1)}" stop-color="${palette[1]}"/>`).join('');
  // 数量の丸バッジ・操作ボタンとは異なる、枠に接続した平らな帯と印字。
  const resolution = Math.min(1, 1600 / Math.max(width, height));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * resolution}" height="${height * resolution}" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="paper" x2="1" y2="1">${gradient}</linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#paper)"/>
    <rect x="${16 * scale}" y="${16 * scale}" width="${width - 32 * scale}" height="${height - 32 * scale}" fill="none" stroke="${ink}" stroke-width="${2 * scale}"/>
    <path d="M0 0H${width}V${12 * scale}H0Z" fill="${ink}"/>
    ${cost ? `<path d="M${16 * scale} ${28 * scale}H${width * 0.7}L${width * 0.7 - 18 * scale} ${cost.y + cost.lines.length * cost.size * cost.lineHeight + 12 * scale}H${16 * scale}Z" fill="${ink}"/>` : ''}
    <g font-family="'Yu Gothic',Meiryo,'Noto Sans CJK JP',sans-serif">${textBlock(cost, { weight: 700, color: '#fff' })}
    ${textBlock(name, { align: 'middle', weight: 700, color: ink, center: true })}
    ${textBlock(metadata, { color: ink })}
    <path d="M${margin} ${divider}H${width - margin}" stroke="${ink}" stroke-width="${scale}"/>
    ${textBlock(body)}${textBlock(power, { align: 'end', weight: 700, color: ink })}</g>
  </svg>`;
}

export const artworkUrl = (face, settings) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createCardArtwork(face, settings))}`;
