import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiSetupPrompt, connectionText } from './setup.js';

test('WindowsのAI向け設定文は選択したアプリと実行パスを含み、接続キーを含めない', () => {
  const info = { clients: [{ id: 'codex', name: 'Codex', configPath: 'C:/test/config.toml' }, { id: 'claude', name: 'Claude Desktop', configPath: 'C:/test/claude.json' }], serverName: 'tcg_local', server: { command: 'C:/TCG App/tcg-local.exe', args: ['--mcp'], env: { TCG_CONNECTION_FILE: 'C:/test/connection.json' } } };
  for (const client of info.clients) {
    const prompt = aiSetupPrompt(info, client.id, { url: 'http://127.0.0.1:1/mcp', token: 'private-test-key' });
    assert.ok(prompt.includes(client.name));
    assert.ok(prompt.includes(client.configPath));
    assert.ok(prompt.includes('C:/TCG App/tcg-local.exe'));
    assert.ok(!prompt.includes('private-test-key'));
    assert.ok(prompt.includes('データはまだ変更しない'));
  }
});
test('ほかのAI向けには現在の接続だけを渡し、未接続時はコピー文を作らない', () => {
  const connection = { url: 'http://127.0.0.1:12345/mcp', token: 'test-token' };
  assert.ok(aiSetupPrompt(null, 'other', connection).includes(connectionText(connection)));
  assert.throws(() => connectionText({ url: '', token: '' }), /先に/);
});
