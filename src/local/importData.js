// UTF-8 CSV（引用符・改行・BOM対応）とJSONを、実行しないデータとして読む。
function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === '"') {
      if (value || closed) throw new Error('CSVの引用符（"）の位置を確認してください。');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(value); value = ''; closed = false;
      if (char !== ',') { if (row.some(cell => cell !== '')) rows.push(row); row = []; if (char === '\r' && text[i + 1] === '\n') i++; }
    } else {
      if (closed) throw new Error('CSVの閉じる引用符（"）の後にカンマか改行が必要です。');
      value += char;
    }
  }
  if (quoted) throw new Error('CSVに閉じる引用符（"）がありません。');
  row.push(value);
  if (row.some(cell => cell !== '')) rows.push(row);
  const headers = rows.shift()?.map(key => key.trim());
  if (!headers?.length || headers.some(key => !key) || new Set(headers).size !== headers.length) throw new Error('CSVの見出しに空欄か同じ名前があります。');
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) throw new Error(`CSVの${i + 2}行目の列数を、見出しと揃えてください。`);
    return Object.fromEntries(headers.map((key, index) => [key, cells[index]]));
  });
}
export function parseCardData(text, source) {
  const clean = text.replace(/^\uFEFF/, '');
  let records;
  if (/\.csv$/i.test(source)) records = parseCsv(clean);
  else if (/\.json$/i.test(source)) {
    const json = JSON.parse(clean);
    records = Array.isArray(json) ? json : json?.cards;
  } else throw new Error('カードデータはCSVまたはJSONを選んでください。');
  if (!Array.isArray(records) || !records.length || records.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('書式例に沿って、カード情報を1件以上入力してください。');
  return records.map(record => ({ record, source }));
}
