import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { resolve, extname, sep, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const maxBytes = 700 * 1024 * 1024;
export async function startAIServer({ port = 4188, root = resolve('dist'), output = resolve('.codex-temp/ai-exports'), connectionFile = resolve('.codex-temp/ai-connection.json') } = {}) {
  const token = randomBytes(32).toString('hex');
  let poll, lastPoll = 0;
  const queue = [], pending = new Map();
  const send = (response, code, data, headers = {}) => { if (!response.destroyed) { response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); response.end(data === undefined ? '' : JSON.stringify(data)); } };
  const readJSON = async request => {
    let size = 0; const chunks = [];
    for await (const chunk of request) { size += chunk.length; if (size > maxBytes) throw new Error('ファイルが大きすぎます。'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const deliver = () => { if (poll && queue.length) { const item = queue.shift(), response = poll; poll = null; send(response, 200, item); } };
  const server = createServer(async (request, response) => {
    try {
      const host = `127.0.0.1:${server.address().port}`;
      if (request.headers.host !== host || (request.headers.origin && request.headers.origin !== `http://${host}`)) { send(response, 403, { error: 'Forbidden origin' }); return; }
      const pathname = new URL(request.url, `http://${host}`).pathname;
      if (pathname === '/mcp' || pathname.startsWith('/__tcg/')) {
        const auth = Buffer.from(request.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
        if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) { send(response, 401, { error: 'Unauthorized' }); return; }
        if (pathname === '/__tcg/check') { send(response, 200, { connected: true }); return; }
        if (pathname === '/__tcg/disconnect' && request.method === 'POST') {
          lastPoll = 0; queue.length = 0;
          if (poll) { send(poll, 204); poll = null; }
          for (const item of pending.values()) { clearTimeout(item.timer); send(item.response, 503, { error: 'AI接続を停止しました。' }); }
          pending.clear(); send(response, 200, {}); return;
        }
        if (pathname === '/__tcg/poll' && request.method === 'GET') {
          if (poll) send(poll, 409, { error: 'Already connected' });
          poll = response; lastPoll = Date.now(); deliver();
          const timer = setTimeout(() => { if (poll === response) { poll = null; send(response, 204); } }, 20000);
          response.on('close', () => { clearTimeout(timer); if (poll === response) poll = null; }); return;
        }
        if (pathname === '/__tcg/reply' && request.method === 'POST') {
          const { exchangeId, message } = await readJSON(request), item = pending.get(exchangeId);
          if (item) { clearTimeout(item.timer); pending.delete(exchangeId); send(item.response, 200, message, { 'Mcp-Session-Id': item.sessionId }); }
          send(response, 200, {}); return;
        }
        if (pathname === '/__tcg/files' && request.method === 'POST') {
          const files = await readJSON(request), dir = resolve(output, randomUUID()), results = [];
          if (!Array.isArray(files) || files.length > 10000) throw new Error('Invalid files');
          await mkdir(dir, { recursive: true });
          for (const [index, file] of files.entries()) {
            const encoded = /^data:[^,]*;base64,([A-Za-z0-9+/=]+)$/.exec(file.dataUrl)?.[1];
            if (!encoded) throw new Error('Invalid file data');
            const name = [...basename(file.name)].map(char => char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char).join('').slice(0, 150);
            const path = resolve(dir, `${index + 1}-${name}`), bytes = Buffer.from(encoded, 'base64');
            await writeFile(path, bytes); results.push({ name: file.name, path, bytes: bytes.length });
          }
          send(response, 200, results); return;
        }
        if (pathname === '/mcp' && request.method === 'DELETE') {
          const sessionId = request.headers['mcp-session-id'];
          if (sessionId && /^[\w-]{1,128}$/.test(sessionId) && queue.length < 32) { queue.push({ sessionId, close: true }); deliver(); }
          send(response, 202); return;
        }
        if (pathname === '/mcp' && request.method === 'POST') {
          if (Date.now() - lastPoll > 45000 || pending.size >= 16 || queue.length >= 32) { send(response, 503, { error: 'アプリを開き、接続を開始してください。' }); return; }
          const message = await readJSON(request), exchangeId = randomUUID();
          const sessionId = request.headers['mcp-session-id'] || randomUUID();
          if (!/^[\w-]{1,128}$/.test(sessionId)) throw new Error('Invalid session');
          if (Object.hasOwn(message, 'id')) {
            const timer = setTimeout(() => { pending.delete(exchangeId); const index = queue.findIndex(item => item.exchangeId === exchangeId); if (index >= 0) queue.splice(index, 1); send(response, 504, { error: '結果不明です。同じrequestIdで再試行してください。' }); }, 120000);
            pending.set(exchangeId, { response, timer, sessionId });
          } else send(response, 202);
          queue.push({ exchangeId, sessionId, message }); deliver(); return;
        }
        send(response, 405, { error: 'Method not allowed' }); return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { send(response, 405); return; }
      const file = resolve(root, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
      if (!file.startsWith(root + sep) || !(await stat(file).catch(() => null))?.isFile()) { send(response, 404); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); response.end(await readFile(file));
    } catch (error) { send(response, 400, { error: error.message }); }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  const url = `http://127.0.0.1:${server.address().port}`;
  if (connectionFile) { await mkdir(resolve(connectionFile, '..'), { recursive: true }); await writeFile(connectionFile, JSON.stringify({ url: `${url}/mcp`, token, port: server.address().port }), { mode: 0o600 }); }
  return { url, token, close: async () => {
    if (poll) send(poll, 503);
    for (const item of pending.values()) { clearTimeout(item.timer); send(item.response, 503); }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    // Test artifacts must not retain connection credentials, or remove a newer server's file.
    if (connectionFile) {
      const current = await readFile(connectionFile, 'utf8').then(JSON.parse).catch(() => null);
      if (current?.token === token) await rm(connectionFile, { force: true });
    }
  } };
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const server = await startAIServer();
  console.log(`接続用URL（この端末だけで使用）: ${server.url}/#tcg-ai=${server.token}`);
  console.log('AIの設定: node scripts/mcp.mjs');
}
