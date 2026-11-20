// Read-only integration check. No inference, persistent chat or user config edits.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';

const { values } = parseArgs({ options: { codex: { type: 'string' }, marketplace: { type: 'string' }, 'game-id': { type: 'string' } } });
assert.ok(values.codex && values.marketplace, 'Use --codex <codex.exe> --marketplace <generated marketplace root> [--game-id <expected game>]');
const marketplace = resolve(values.marketplace);
const catalogPath = join(marketplace, '.agents/plugins/marketplace.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const plugin = catalog.plugins.find(plugin => plugin.name === 'tcg-manager');
assert.ok(plugin?.source?.source === 'local', 'A generated local TCG plugin is required');
const manifest = JSON.parse(await readFile(join(marketplace, plugin.source.path, '.codex-plugin/plugin.json'), 'utf8'));
const pluginId = `${plugin.name}@${catalog.name}`;
await mkdir('.codex-temp', { recursive: true });
const probeHome = await mkdtemp(resolve('.codex-temp/codex-plugin-check-'));
const child = spawn(resolve(values.codex), ['app-server'], {
  env: { ...process.env, CODEX_HOME: probeHome }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
});
child.stderr.on('data', () => {}); // Never persist raw runtime diagnostics or auth details.
let sequence = 0;
const pending = new Map();
const stopPending = message => {
  for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error(message)); }
  pending.clear();
};
child.on('error', () => stopPending('Codex could not be started'));
child.on('exit', () => stopPending('Codex exited before returning a result'));
createInterface({ input: child.stdout }).on('line', line => {
  let response;
  try { response = JSON.parse(line); } catch { return; }
  const request = pending.get(response.id);
  if (!request) return;
  pending.delete(response.id); clearTimeout(request.timer);
  if (response.error) request.reject(new Error(`App-server request failed (${response.error.code})`));
  else request.resolve(response.result);
});
const request = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 45000);
  pending.set(id, { resolve, reject, timer });
  child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
});

try {
  await request('initialize', { clientInfo: { name: 'tcg-plugin-isolation-test', version: '1' }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  await request('marketplace/add', { source: marketplace });
  await request('plugin/install', { pluginName: plugin.name, marketplacePath: catalogPath });
  const config = await readFile(join(probeHome, 'config.toml'), 'utf8');
  assert.ok(!config.includes('[mcp_servers'), 'Direct MCP registration must be absent');
  const pluginRoot = join(probeHome, 'plugins/cache', catalog.name, plugin.name, manifest.version);
  const { thread } = await request('thread/start', {
    cwd: probeHome, ephemeral: true,
    selectedCapabilityRoots: [{ id: pluginId, location: { type: 'environment', environmentId: 'local', path: pluginRoot } }],
  });
  assert.equal(thread.ephemeral, true);
  const { data: servers } = await request('mcpServerStatus/list', { threadId: thread.id, limit: 100, detail: 'toolsAndAuthOnly' });
  const server = servers.find(server => Object.values(server.tools).some(tool => tool.name === 'tcg_status'));
  assert.ok(server, 'tcg_status must be published');
  assert.equal(server.pluginId, pluginId, 'The server must be attributed to the installed plugin');
  const result = await request('mcpServer/tool/call', { threadId: thread.id, server: server.name, tool: 'tcg_status', arguments: {} });
  assert.ok(!result.isError, 'tcg_status must succeed');
  const status = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);
  assert.equal(status.status, 'ready');
  if (values['game-id']) assert.equal(status.data.gameId, values['game-id'], 'The selected game must match');
  const summary = { directMcpRegistrationAbsent: true, ephemeral: true, pluginId, toolCount: Object.keys(server.tools).length, status: status.status, expectedGameMatched: values['game-id'] ? true : null };
  await writeFile(join(probeHome, 'result.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} catch (error) {
  console.error(error.message.replace(/[a-f0-9]{64}/gi, '[REDACTED]'));
  process.exitCode = 1;
} finally {
  child.stdin.end(); child.kill();
}
