import { test, expect } from '@playwright/test';

// The native boundary is stubbed; real configuration-file writes are tested in Rust.
async function nativeFixture(page, clients = [{ id: 'codex', name: 'Codex', configPath: 'C:/fixture/config.toml' }, { id: 'claude', name: 'Claude Desktop', configPath: 'C:/fixture/claude.json' }]) {
  await page.addInitScript(({ clients }) => {
    window.setupCalls = []; window.copied = ''; window.setupFailure = false; window.clipboardFailure = false;
    window.pluginSavePath = 'C:/fixture/TCG-Manager-local-plugin.zip'; window.pluginWriteFailure = false;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { if (window.clipboardFailure) throw new Error('コピーできませんでした。'); window.copied = text; } } });
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (command, args) => {
        window.setupCalls.push({ command, args });
        if (command === 'ai_setup_info') return { clients, plugins: clients.length ? [{ id: 'Claude Cowork', name: 'Claude Cowork（PC）' }, { id: 'work', name: 'ChatGPT Work（PC）' }] : [], serverName: 'tcg_local', server: { command: 'C:/fixture/tcg-local.exe', args: ['--mcp'], env: { TCG_CONNECTION_FILE: 'C:/fixture/connection.json' } } };
        if (command === 'ai_plugin_files') return { '.claude-plugin/plugin.json': '{"name":"tcg-manager"}', '.mcp.json': '{"mcpServers":{"tcg_local":{"command":"C:/fixture/tcg-local.exe","args":["--mcp"]}}}' };
        if (command === 'plugin:dialog|save') return window.pluginSavePath;
        if (command === 'plugin:fs|open') return 1;
        if (command === 'plugin:fs|write') { if (window.pluginWriteFailure) throw new Error('プラグインを書き込めませんでした'); return args.data.length; }
        if (command === 'plugin:resources|close') return null;
        if (command === 'open_work_plugin') { if (window.setupFailure) throw new Error('導入画面を開けませんでした'); return null; }
        if (command === 'configure_ai_client') {
          if (window.setupFailure) throw new Error('同名のTCG接続に別の設定があります。');
          return { changed: true, client: clients.find(row => row.id === args.client).name };
        }
        if (command === 'enable_ai') return { url: 'http://127.0.0.1:54321/mcp', token: 'fixture-secret' };
        if (command === 'ai_connection_diagnostics') return { listening: true, fileMatches: true, connectionFile: 'C:/fixture/connection.json', toolAvailability: 'AIアプリの会話でtcg_statusを実行して確認してください。' };
        if (['disable_ai', 'plugin:event|listen', 'plugin:event|unlisten'].includes(command)) return 1;
        throw new Error(`Unexpected native call: ${command}`);
      },
    };
  }, { clients });
  await page.goto('/');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('button', { name: 'AI連携', exact: true }).click();
}

test('GUIでAIを選び設定・開始・依頼文コピー・停止でき、登録失敗は接続成功と扱わない', async ({ page }, testInfo) => {
  await nativeFixture(page);
  await page.getByLabel('使うAIアプリ').selectOption('claude');
  await expect(page.getByText('次回からの使い方', { exact: true })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('ai-setup-first-time.png') });
  await page.getByRole('button', { name: '作業を頼む文章をコピー', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toContain('依頼：');
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('実行する前に「AIとの接続を開始」を押してください。');
  await page.getByRole('button', { name: '接続を設定する文章をコピー', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toContain('C:/fixture/claude.json');
  expect(await page.evaluate(() => window.setupCalls.some(row => ['enable_ai', 'configure_ai_client'].includes(row.command)))).toBe(false);
  await page.evaluate(() => { window.setupFailure = true; });
  await page.getByRole('button', { name: 'Claude Desktopに接続を登録', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('同名のTCG接続');
  expect(await page.evaluate(() => window.setupCalls.some(row => row.command === 'enable_ai'))).toBe(false);
  await page.evaluate(() => { window.setupFailure = false; });
  await page.getByRole('button', { name: 'Claude Desktopに接続を登録', exact: true }).click();
  await expect(page.getByText('Claude Desktopの接続設定を保存しました。', { exact: false })).toBeVisible();
  await expect(page.getByText('接続待ちです。', { exact: false })).toBeVisible();
  await expect(page.getByText('アプリの待受：開始済み。', { exact: false })).toContainText('MCP認証・初期化：未確認');
  await page.getByText('接続できないとき', { exact: true }).click();
  await page.getByRole('button', { name: '接続ファイルを確認', exact: true }).click();
  await expect(page.getByText('接続ファイルは現在の待受と一致しています。', { exact: false })).toBeVisible();
  await page.getByText('接続できないとき', { exact: true }).click();
  expect(await page.evaluate(() => window.setupCalls.filter(row => row.command === 'configure_ai_client').every(row => row.args.client === 'claude'))).toBe(true);
  await expect(page.getByRole('button', { name: '接続を設定する文章をコピー' })).toBeVisible();
  await expect(page.getByRole('button', { name: '接続情報をまとめてコピー' })).toBeHidden();
  await page.getByRole('button', { name: '接続を設定する文章をコピー' }).click();
  const prompt = await page.evaluate(() => window.copied);
  expect(prompt).toContain('C:/fixture/claude.json'); expect(prompt).not.toContain('fixture-secret');
  await expect(page.getByText('接続を設定する文章をコピーしました。設定を操作できるAIに貼り付けて送信してください。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '作業を頼む文章をコピー', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toContain('依頼：');
  await expect(page.getByText('文章をコピーしました。AIアプリに貼り付け、「依頼：」の後に頼みたいことを書いてください。', { exact: true })).toBeVisible();
  await page.evaluate(() => { window.clipboardFailure = true; });
  await page.getByRole('button', { name: '作業を頼む文章をコピー', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('コピーできませんでした');
  await expect(page.getByText('文章をコピーしました。AIアプリに貼り付け、「依頼：」の後に頼みたいことを書いてください。', { exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.clipboardFailure = false; });
  await page.getByRole('button', { name: '作業を頼む文章をコピー', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('ai-setup-desktop.png') });
  await page.getByRole('button', { name: 'AIとの接続を停止', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AIとの接続を開始', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '作業を頼む文章をコピー', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toContain('依頼：');
  await expect(page.getByRole('button', { name: '接続を設定する文章をコピー', exact: true })).toBeEnabled();
  await page.getByText('詳しく見る', { exact: true }).click();
  await expect(page.getByText('次回からの使い方', { exact: true })).toBeVisible();
});

test('Android相当の画面は自動登録を示さず、接続情報のコピーと停止ができる', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await nativeFixture(page, []);
  await expect(page.getByRole('button', { name: /に接続を登録$/ })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Claude Cowork（PC）', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('ai-setup-mobile-first-time.png') });
  await expect(page.getByRole('button', { name: '接続を設定する文章をコピー' })).toBeVisible();
  await expect(page.getByRole('button', { name: '接続を設定する文章をコピー' })).toBeDisabled();
  await page.getByRole('button', { name: '作業を頼む文章をコピー', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toContain('依頼：');
  expect(await page.evaluate(() => window.setupCalls.some(row => row.command === 'enable_ai'))).toBe(false);
  await page.getByRole('button', { name: 'AIとの接続を開始', exact: true }).click();
  await expect(page.getByRole('button', { name: '接続を設定する文章をコピー' })).toBeVisible();
  await page.getByRole('button', { name: '接続を設定する文章をコピー' }).click();
  expect(await page.evaluate(() => window.copied)).toContain('データはまだ変更しない');
  await page.getByText('接続先・キーを手動で入力する', { exact: true }).click();
  await page.getByRole('button', { name: '接続情報をまとめてコピー' }).click();
  const text = await page.evaluate(() => window.copied);
  expect(text).toContain('http://127.0.0.1:54321/mcp'); expect(text).toContain('Authorization: Bearer fixture-secret');
  await page.screenshot({ path: testInfo.outputPath('ai-setup-mobile.png') });
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'AIとの接続を停止', exact: true }).click();
  await expect(page.getByRole('button', { name: '作業を頼む文章をコピー', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '接続を設定する文章をコピー' })).toBeVisible();
  await expect(page.getByRole('button', { name: '接続を設定する文章をコピー' })).toBeDisabled();
});

test('Claude CoworkのZIP保存・取消・失敗を区別し、Workの導入画面を開いても接続済みにしない', async ({ page }, testInfo) => {
  await nativeFixture(page);
  await page.getByLabel('使うAIアプリ').selectOption('Claude Cowork');
  await expect(page.getByRole('button', { name: /に接続を登録$/ })).toHaveCount(0);
  await page.getByRole('button', { name: '作業を頼む文章をコピー', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toContain('依頼：');
  await page.getByText('追加の手順を見る', { exact: true }).click();
  await expect(page.getByText('ZIPを保存したら、', { exact: false })).toBeVisible();
  await page.getByText('追加の手順を見る', { exact: true }).click();
  await page.evaluate(() => { window.pluginSavePath = null; });
  await page.getByRole('button', { name: 'Claude Cowork用プラグインを保存' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('保存を取り消しました');
  expect(await page.evaluate(() => window.setupCalls.some(row => ['plugin:fs|open', 'plugin:fs|write'].includes(row.command)))).toBe(false);
  await page.evaluate(() => { window.pluginSavePath = 'C:/fixture/plugin.zip'; window.pluginWriteFailure = true; });
  await page.getByRole('button', { name: 'Claude Cowork用プラグインを保存' }).click();
  await expect(page.getByRole('alert')).toContainText('書き込めませんでした');
  await expect(page.getByText('プラグインを保存しました。', { exact: false })).toHaveCount(0);
  await page.evaluate(() => { window.pluginWriteFailure = false; });
  await page.getByRole('button', { name: 'Claude Cowork用プラグインを保存' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Claude Coworkの「カスタマイズ → プラグイン」でこのZIPを追加');
  expect(await page.evaluate(() => window.setupCalls.some(row => row.command === 'enable_ai'))).toBe(false);
  await page.getByRole('button', { name: 'AIとの接続を開始', exact: true }).click();
  await expect(page.getByRole('button', { name: '作業を頼む文章をコピー' })).toBeVisible();
  await page.getByText('接続できないとき', { exact: true }).click();
  await expect(page.getByRole('button', { name: '接続を設定する文章をコピー' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('Claude Cowork-plugin.png') });
  await page.getByRole('button', { name: 'AIとの接続を停止', exact: true }).click();
  await page.getByLabel('使うAIアプリ').selectOption('work');
  await page.getByRole('button', { name: '作業を頼む文章をコピー', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toContain('依頼：');
  await page.evaluate(() => { window.setupFailure = true; });
  await page.getByRole('button', { name: 'プラグインの導入画面を開く' }).click();
  await expect(page.getByRole('alert')).toContainText('導入画面を開けませんでした');
  await page.evaluate(() => { window.setupFailure = false; });
  await page.getByRole('button', { name: 'プラグインの導入画面を開く' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('導入画面を開きました');
  await expect(page.getByRole('button', { name: 'AIとの接続を開始', exact: true })).toBeEnabled();
});
