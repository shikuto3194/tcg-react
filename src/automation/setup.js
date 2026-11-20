export async function getAISetup() {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('ai_setup_info');
}
export async function configureAIClient(client) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('configure_ai_client', { client });
}
export async function diagnoseAIConnection() {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('ai_connection_diagnostics');
}

export function connectionText({ url, token }) {
  if (!url || !token) throw new Error('先にAIからの接続を開始してください。');
  return `名前: TCG マネージャー\n接続方式: Streamable HTTP（MCP）\n接続先: ${url}\nAuthorization: Bearer ${token}`;
}

export function aiSetupPrompt(info, client, connection) {
  const profile = info?.clients.find(row => row.id === client);
  const setup = profile
    ? `このWindows端末の${profile.name}にTCG マネージャーを接続してください。\n設定先: ${profile.configPath}\n接続名: ${info.serverName}\n接続設定（Codexではmcp_serversのTOML、Claude DesktopではmcpServersのJSONへ追加）:\n${JSON.stringify(info.server, null, 2)}\n既存設定を読み、バックアップしてからTCGの接続だけを追加してください。同名の別設定は勝手に上書きしないでください。`
    : `この端末で利用しているAIアプリに、次のローカルMCP接続を設定してください。\n${connectionText(connection)}\nこの接続用キーはこの接続のためだけに使い、公開しないでください。アプリがローカルMCPの設定に対応しない場合は、その制限を教えてください。`;
  return `${setup}\nTCG マネージャーは開いたまま使います。接続後にtcg_statusを呼び、対象ゲームを報告してください。データはまだ変更しないでください。ログインや再起動など自分で行えない操作は案内してください。AIアプリの権限・承認設定は変更しないでください。`;
}

export const aiTaskPrompt = 'TCG マネージャーの接続を使って、これから伝える依頼を実行してください。最初にtcg_statusで対象ゲームを確認し、必要なカード・デッキ・戦績を読み、依頼された範囲で操作を進めてください。検索のfieldsはtcg_settings_getのfieldKeysとlabelsで確認してください。ツールが見えない場合は、アプリの待受・MCP認証・AI側のツール公開を分けて確認し、開始済みのユーザーに開始操作を繰り返させないでください。削除・上書きは意図が明確な場合だけ行い、結果を読み直して保存を確認してください。\n\n依頼：';
