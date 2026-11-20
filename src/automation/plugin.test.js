import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { pluginArchive } from './plugin.js';

test('プラグインZIPは隠しフォルダ・日本語・空白入り実行パスを保持する', async () => {
  const files = { '.claude-plugin/plugin.json': '{"name":"tcg-manager"}', '.codex-plugin/plugin.json': '{"name":"tcg-manager"}', '.mcp.json': JSON.stringify({ mcpServers: { tcg_local: { command: 'C:\\TCG アプリ\\tcg-local.exe', args: ['--mcp'] } } }), 'README.md': 'このPCのTCG マネージャーで使います。' };
  const zip = await pluginArchive(files);
  assert.equal(zip.type, 'application/zip');
  const unpacked = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.deepEqual(Object.fromEntries(Object.entries(unpacked).map(([path, bytes]) => [path, strFromU8(bytes)])), files);
});
