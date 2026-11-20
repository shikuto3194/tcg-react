import { useSyncExternalStore } from 'react';
import { nativeHost } from '../local/nativeHost.js';
let state = { connected: false, busy: false, clientSeen: false, toolsSeen: false, statusSeen: false, url: '', token: '', error: '', files: [] };
const listeners = new Set();
const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
export const useAIConnection = () => useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => state);
let stop;
let transition = Promise.resolve();
let webToken;
const enqueue = action => {
  const next = transition.then(action, action);
  transition = next.catch(() => {});
  return next;
};

export const stopAIConnection = () => enqueue(async () => {
  publish({ busy: true });
  try {
    await stop?.(); stop = null;
    sessionStorage.removeItem('tcg-ai-session');
    publish({ connected: false, clientSeen: false, toolsSeen: false, statusSeen: false, url: '', token: '', error: '' });
  } catch (error) { publish({ error: String(error.message || error) }); }
  finally { publish({ busy: false }); }
});
export const startAIConnection = () => enqueue(() => stop ? true : openConnection());
async function openConnection() {
  publish({ error: '', busy: true, clientSeen: false, toolsSeen: false, statusSeen: false });
  const onClient = () => publish({ clientSeen: true });
  const onStage = stage => publish(stage === 'status' ? { statusSeen: true } : { toolsSeen: true });
  try {
    const { createMcpHost } = await import('./mcpHost.js');
    if (nativeHost()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');
      const host = createMcpHost({ onClient, onStage, output: async result => {
        if (!result.data?.files) return result;
        const files = await invoke('save_ai_files', { files: result.data.files });
        publish({ files }); return { ...result, data: { files, location: 'application_private_storage' } };
      } });
      const unlisten = await listen('tcg-mcp-request', async ({ payload }) => {
        if (payload.close) { await host.closeSession(payload.sessionId); return; }
        try { await host.receive(payload.sessionId, payload.message, message => invoke('mcp_reply', { exchangeId: payload.exchangeId, message })); }
        catch (error) { await invoke('mcp_reply', { exchangeId: payload.exchangeId, message: { jsonrpc: '2.0', id: payload.message.id ?? null, error: { code: -32603, message: error.message } } }); }
      });
      try {
        const info = await invoke('enable_ai');
        stop = async () => { await invoke('disable_ai'); await unlisten(); await host.close(); };
        publish({ ...info, connected: true });
      } catch (error) { await unlisten(); await host.close(); throw error; }
    } else {
      const params = new URLSearchParams(location.hash.slice(1));
      const token = params.get('tcg-ai') || sessionStorage.getItem('tcg-ai-session') || webToken;
      if (!token) throw new Error('Web版はnpm run ai:serveで起動し、表示された接続用URLを開いてください。');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const check = await fetch('/__tcg/check', { headers });
      if (!check.ok) throw new Error('接続用URLが期限切れです。起動中のURLを確認してください。');
      webToken = token;
      sessionStorage.setItem('tcg-ai-session', token);
      if (params.has('tcg-ai')) history.replaceState(null, '', location.pathname + location.search);
      const controller = new AbortController();
      const host = createMcpHost({ onClient, onStage, output: async result => {
        if (!result.data?.files) return result;
        const response = await fetch('/__tcg/files', { method: 'POST', headers, body: JSON.stringify(result.data.files), signal: controller.signal });
        if (!response.ok) throw new Error('出力ファイルを保存できませんでした。');
        const files = await response.json(); publish({ files }); return { ...result, data: { files } };
      } });
      stop = async () => {
        controller.abort(); await host.close();
        await fetch('/__tcg/disconnect', { method: 'POST', headers }).catch(() => {});
      };
      publish({ connected: true, url: `${location.origin}/mcp`, token });
      void (async () => {
        try {
          while (!controller.signal.aborted) {
            const response = await fetch('/__tcg/poll', { headers, signal: controller.signal });
            if (!response.ok) throw new Error('AI接続が切れました。もう一度接続してください。');
            if (response.status === 204) continue;
            const payload = await response.json();
            if (payload.close) { await host.closeSession(payload.sessionId); continue; }
            const respond = async message => {
              const reply = await fetch('/__tcg/reply', { method: 'POST', headers, body: JSON.stringify({ exchangeId: payload.exchangeId, message }), signal: controller.signal });
              if (!reply.ok) throw new Error('操作結果の送信に失敗しました。');
            };
            try { await host.receive(payload.sessionId, payload.message, respond); }
            catch (error) { await respond({ jsonrpc: '2.0', id: payload.message.id ?? null, error: { code: -32603, message: error.message } }); }
          }
        } catch (error) { if (!controller.signal.aborted) { await stopAIConnection(); publish({ error: error.message }); } }
      })();
    }
    return true;
  } catch (error) { publish({ error: String(error.message || error) }); return false; }
  finally { publish({ busy: false }); }
}
export function resumeAIConnection() {
  // Native access is always an explicit opt-in after launch.
  if (!nativeHost() && (location.hash.startsWith('#tcg-ai=') || sessionStorage.getItem('tcg-ai-session'))) void startAIConnection();
}
