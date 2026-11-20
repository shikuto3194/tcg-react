import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createMcpHost } from './mcpHost.js';
import { initializeLibrary, getLocalCards } from '../local/store.js';

async function connect(host, sessionId) {
  const client = new Client({ name: 'session-regression', version: '1' });
  const transport = {
    async start() {},
    // Simulate a client disappearing without HTTP DELETE.
    async close() { transport.onclose?.(); },
    async send(message) { await host.receive(sessionId, message, reply => transport.onmessage(reply)); },
  };
  await client.connect(transport);
  return client;
}
const call = async (client, name, args = {}) => (await client.callTool({ name, arguments: args })).structuredContent;
const request = (host, sessionId, id) => new Promise((resolve, reject) => {
  host.receive(sessionId, { jsonrpc: '2.0', id, method: 'tools/list' }, resolve).catch(reject);
});

test('終了通知なしの接続を回収し、元の接続と保存済み操作の再送を維持する', { timeout: 10000 }, async () => {
  let saved = { format: 'tcg-local-library-v1', activeGameId: 'test', games: [{ gameId: 'test', name: '検証', settings: { labels: [], source: 'folder' }, cards: [], storage: {} }] };
  await initializeLibrary({ read: async () => structuredClone(saved), write: async value => { saved = structuredClone(value); } });
  const host = createMcpHost();
  const original = await connect(host, 'original');
  try {
    const status = await call(original, 'tcg_status');
    const args = { gameId: 'test', expectedRevision: status.revision, requestId: crypto.randomUUID(), card: { name: '赤いカード' } };
    const written = await call(original, 'tcg_cards_add', args);
    assert.equal(written.status, 'saved');
    for (let index = 0; index < 40; index++) {
      const client = await connect(host, `abandoned-${index}`);
      assert.ok((await client.listTools()).tools.length >= 30);
      await client.close();
    }
    assert.deepEqual(await call(original, 'tcg_cards_add', args), written);
    assert.equal(getLocalCards().length, 1);
    assert.equal((await call(original, 'tcg_status')).data.gameId, 'test');
  } finally { await original.close(); await host.close(); }
});

test('同じ接続への同時要求を取り落とさず、明示終了後も再接続できる', async () => {
  const host = createMcpHost();
  try {
    const replies = await Promise.all([request(host, 'same', 1), request(host, 'same', 2)]);
    assert.deepEqual(replies.map(reply => reply.id), [1, 2]);
    for (let index = 0; index < 20; index++) {
      const client = await connect(host, `explicit-${index}`);
      await host.closeSession(`explicit-${index}`);
      await client.close();
    }
    assert.ok((await request(host, 'same', 3)).result.tools.length >= 30);
  } finally { await host.close(); }
  await assert.rejects(request(host, 'after-stop', 4), /停止/);
});

test('応答送信中の16接続は回収せず、完了した接続から回収する', { timeout: 10000 }, async () => {
  const host = createMcpHost();
  const releases = [], completed = [];
  try {
    for (let index = 0; index < 16; index++) {
      let started;
      const ready = new Promise(resolve => { started = resolve; });
      let complete;
      completed.push(new Promise(resolve => { complete = resolve; }));
      const gate = new Promise(resolve => { releases.push(resolve); });
      await host.receive(`busy-${index}`, { jsonrpc: '2.0', id: index, method: 'tools/list' }, async reply => {
        started(); await gate; complete(reply);
      });
      await ready;
    }
    await assert.rejects(request(host, 'extra', 100), /混み合って/);
    releases[0](); await completed[0];
    // Let the transport finish sending before requesting another slot.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await request(host, 'extra', 101)).id, 101);
    for (const release of releases) release();
    assert.deepEqual((await Promise.all(completed)).map(reply => reply.id), Array.from({ length: 16 }, (_, index) => index));
  } finally { for (const release of releases) release(); await host.close(); }
});
