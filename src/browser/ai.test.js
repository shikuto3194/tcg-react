import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startAIServer } from '../../scripts/ai-server.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

// Traces include the bootstrap URL and HTTP authorization headers.
test.use({ trace: 'off' });

test('MCPを通じた画面との共同編集・再送・競合・ファイル出力・接続保護', async ({ page }, testInfo) => {
  const connectionFile = testInfo.outputPath('connection.json');
  const server = await startAIServer({ port: 0, connectionFile, output: testInfo.outputPath('exports') });
  const client = new Client({ name: 'tcg-integration-test', version: '1.0.0' });
  try {
    await page.goto(`${server.url}/#tcg-ai=${server.token}`);
    await page.waitForFunction(() => !!sessionStorage.getItem('tcg-ai-session'));
    const transport = new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${server.token}` } } });
    await client.connect(transport);
    expect(client.getInstructions()).toContain('expectedRevision');
    const tools = await client.listTools(); expect(tools.tools.length).toBeGreaterThanOrEqual(30);
    const call = async (name, args = {}) => {
      const response = await client.callTool({ name: `tcg_${name}`, arguments: args });
      if (response.isError) return { error: JSON.parse(response.content[0].text) };
      return response.structuredContent;
    };
    const status = await call('status'), gameId = status.data.gameId;
    const writeArgs = async args => ({ gameId, requestId: crypto.randomUUID(), expectedRevision: (await call('status')).revision, ...args });
    const found = await call('cards_search', { gameId, limit: 1 }); const cardId = found.data.cards[0].id;
    const input = await writeArgs({ cardId, zoneId: 'main', count: 2 });
    const result = await call('draft_set_count', input); expect(result.status).toBe('saved');
    expect(await call('draft_set_count', input)).toEqual(result);
    await page.getByRole('button', { name: '作成中デッキ', exact: true }).click();
    await expect(page.locator('#deckNameInput')).toBeVisible();
    expect((await call('draft_get', { gameId })).data.deck[0].count).toBe(2);
    const stale = await writeArgs({ cardId, zoneId: 'main', count: 3 });
    await page.locator('#deckNameInput').fill('人間の名前');
    expect((await call('draft_set_count', stale)).error.code).toBe('CONFLICT');
    const saved = await call('draft_save', await writeArgs({})); expect(saved.status).toBe('saved');
    await page.getByRole('button', { name: '保存デッキ', exact: true }).click();
    await expect(page.locator('.saved-deck-card').filter({ hasText: '人間の名前' })).toHaveCount(1);
    for (const format of ['json', 'svg', 'png', 'pdf']) {
      const output = await call('deck_export', { gameId, deckId: saved.data.deckId, format });
      expect(output.data.files.length).toBeGreaterThan(0);
      const bytes = await readFile(output.data.files[0].path);
      if (format === 'json') expect(JSON.parse(bytes).cards[0].count).toBe(2);
      if (format === 'svg') expect(bytes.toString()).toContain('<svg');
      if (format === 'png') expect([...bytes.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
      if (format === 'pdf') expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    }
    const otherDeck = (await call('decks_search', { gameId })).data.find(deck => deck.id !== saved.data.deckId);
    const eventWrite = await call('events_put', await writeArgs({ event: {
      name: 'AIの2デッキBO3', format: 'BO3', deckCount: '2',
      decks: [{ id: 'entry-a', deckId: saved.data.deckId }, { id: 'entry-b', deckId: otherDeck.id }],
      matches: [{ result: 'win', games: [
        { registeredDeckId: 'entry-a', result: 'loss', opponent: '相手X', turn: 'first' },
        { registeredDeckId: 'entry-b', result: 'win', opponent: '相手Y', turn: 'second' },
        { registeredDeckId: 'entry-a', result: 'win', opponent: '相手Y', turn: 'second' },
      ] }],
    } }));
    expect(eventWrite.status).toBe('saved');
    const recorded = (await call('events_list', { gameId })).data.find(event => event.id === eventWrite.data.eventId);
    expect(recorded.decks).toHaveLength(2); expect(recorded.matches[0].games).toHaveLength(3);
    expect(recorded.matches[0].games[0].cards[0].count).toBe(2);
    expect((await call('statistics_get', { gameId })).data.totals).toEqual({ win: 1, loss: 0, draw: 0 });
    const gameStats = (await call('statistics_get', { gameId, unit: 'game', filters: { deckCount: '2', format: 'BO3' }, group: 'deck' })).data;
    expect(gameStats.unit).toBe('game'); expect(gameStats.totals).toEqual({ win: 2, loss: 1, draw: 0 });
    expect(gameStats.groups).toHaveLength(2);
    await page.getByRole('button', { name: 'カード検索', exact: true }).click();
    await page.getByRole('button', { name: '所持枚数を閲覧・編集', exact: true }).click();
    expect((await call('draft_clear', await writeArgs({}))).error.code).toBe('EDIT_IN_PROGRESS');
    await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
    let screen = (await call('ui_inspect', { gameId })).data;
    const begin = screen.controls.find(control => control.label === '所持枚数を閲覧・編集');
    expect(begin).toBeTruthy();
    await call('ui_act', { gameId, screenId: screen.screenId, control: begin.control, action: 'click' });
    expect((await call('ui_act', { gameId, screenId: screen.screenId, control: begin.control, action: 'click' })).error.code).toBe('CONFLICT');
    await expect(page.getByRole('region', { name: '所持枚数編集モード' })).toBeVisible();
    screen = (await call('ui_inspect', { gameId })).data;
    const cancel = screen.controls.find(control => control.label === 'キャンセル');
    await call('ui_act', { gameId, screenId: screen.screenId, control: cancel.control, action: 'click' });
    await expect(page.getByRole('region', { name: '所持枚数編集モード' })).toHaveCount(0);
    expect((await fetch(`${server.url}/mcp`, { method: 'POST', body: '{}' })).status).toBe(401);
    expect((await fetch(`${server.url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${server.token}`, Origin: 'https://untrusted.example' }, body: '{}' })).status).toBe(403);
    await page.screenshot({ path: testInfo.outputPath('ai-connected.png') });
    const stdio = new Client({ name: 'stdio-test', version: '1' });
    const nativeExecutable = process.env.TCG_NATIVE_EXE;
    try {
      await stdio.connect(new StdioClientTransport({ command: nativeExecutable || process.execPath, args: nativeExecutable ? ['--mcp'] : [resolve('scripts/mcp.mjs')], env: { ...process.env, TCG_CONNECTION_FILE: connectionFile } }));
      expect((await stdio.listTools()).tools.length).toBe(tools.tools.length);
      const result = await stdio.callTool({ name: 'tcg_status', arguments: {} });
      expect(result.structuredContent.data.gameId).toBe(gameId);
      const cards = await stdio.callTool({ name: 'tcg_cards_search', arguments: { gameId, limit: 200 } });
      expect(cards.structuredContent.data.cards.length).toBeGreaterThan(20);
      const unknown = await stdio.callTool({ name: 'tcg_cards_search', arguments: { gameId, fields: { item1: '赤' } } });
      expect(unknown.isError).toBe(true);
      expect(JSON.parse(unknown.content[0].text).code).toBe('INVALID_SEARCH_FIELD');
      // These cards exist only in this isolated browser profile.
      const red = await call('cards_add', await writeArgs({ card: { name: 'AI検索検証 赤', color: '赤' } }));
      const blue = await call('cards_add', await writeArgs({ card: { name: 'AI検索検証 青', color: '青' } }));
      expect(red.status).toBe('saved'); expect(blue.status).toBe('saved');
      const filtered = await stdio.callTool({ name: 'tcg_cards_search', arguments: { gameId, fields: { color: '赤' } } });
      expect(filtered.structuredContent.data.cards.map(card => card.id)).toEqual([red.data.cardId]);
    } finally { await stdio.close(); }
    // Closing sessions must release the host's bounded session slots.
    for (let index = 0; index < 18; index++) {
      const temporary = new Client({ name: 'session-test', version: '1' });
      const connection = new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${server.token}` } } });
      await temporary.connect(connection); await connection.terminateSession(); await temporary.close();
    }
    // SDK close() does not send DELETE. Real clients can also be force-killed.
    for (let index = 0; index < 20; index++) {
      const temporary = new Client({ name: 'abandoned-session-test', version: '1' });
      const connection = new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${server.token}` } } });
      await temporary.connect(connection); await temporary.close();
    }
    // The original client must still work after its idle SDK session is reclaimed.
    expect((await call('status')).data.gameId).toBe(gameId);
    expect((await call('cards_search', { gameId, limit: 200 })).data.cards.length).toBeGreaterThan(20);
    expect(tools.tools.some(tool => tool.name === 'tcg_game_delete')).toBe(false);
    const beforeDeletion = await call('games_list');
    expect((await call('game_delete', await writeArgs({ confirm: true }))).error.code).toBe('UNKNOWN_OPERATION');
    await call('ui_set', { gameId, tab: 'home' });
    screen = (await call('ui_inspect', { gameId })).data;
    const gameSelect = screen.controls.find(control => control.label === 'ゲーム');
    expect(gameSelect.options.some(option => option.value === '__delete')).toBe(false);
    const blocked = await call('ui_act', { gameId, screenId: screen.screenId, control: gameSelect.control, action: 'fill', value: '__delete', confirm: true });
    expect(blocked.error.message).toContain('選択できない');
    const deleteDialog = page.getByRole('dialog', { name: 'ゲームを削除', exact: true });
    await expect(deleteDialog).toHaveCount(0);
    // Even if the user opens and checks the confirmation, AI cannot submit it.
    await page.getByRole('combobox', { name: 'ゲーム', exact: true }).selectOption('__delete');
    await deleteDialog.getByRole('checkbox').check();
    const restricted = (await call('ui_inspect', { gameId })).data;
    expect(restricted.controls.some(control => ['削除する', 'このゲームのデータを削除することを確認しました'].includes(control.label))).toBe(false);
    await deleteDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    expect(await call('games_list')).toEqual(beforeDeletion);
    await page.getByRole('button', { name: '設定', exact: true }).click();
    await page.getByRole('button', { name: 'AI連携', exact: true }).click();
    await expect(page.getByText('AIからの接続を確認しました。', { exact: false })).toBeVisible();
    const privateScreen = await call('ui_inspect', { gameId });
    expect(JSON.stringify(privateScreen)).not.toContain(server.token);
    expect(privateScreen.data.controls.some(control => control.label === 'AIとの接続を停止')).toBe(false);
    await transport.terminateSession();
    await page.getByRole('button', { name: 'AIとの接続を停止', exact: true }).click();
    await expect(page.getByRole('button', { name: 'AIとの接続を開始', exact: true })).toBeVisible();
    expect((await fetch(`${server.url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${server.token}` }, body: '{}' })).status).toBe(503);
    await page.getByRole('button', { name: 'AIとの接続を開始', exact: true }).click();
    await expect(page.getByText('接続待ちです。', { exact: false })).toBeVisible();
    const restarted = new Client({ name: 'restarted-test', version: '1' });
    try {
      await restarted.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${server.token}` } } }));
      expect((await restarted.listTools()).tools.length).toBe(tools.tools.length);
    } finally { await restarted.close(); }
    await page.getByRole('button', { name: 'AIとの接続を停止', exact: true }).click();
  } finally { await client.close().catch(() => {}); await server.close(); }
});
