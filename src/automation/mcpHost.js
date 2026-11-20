import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { operations } from './catalog.js';
import { executeOperation } from './operations.js';

export function createMcpHost({ output = async value => value, onClient = () => {}, onStage = () => {} } = {}) {
  const sessions = new Map();
  let closed = false;
  const dispose = async session => {
    await session.ready.catch(() => {});
    await session.server.close();
  };
  return {
    async closeSession(sessionId) {
      const session = sessions.get(sessionId);
      sessions.delete(sessionId);
      if (session) await dispose(session);
    },
    async receive(sessionId, message, respond) {
      if (closed) throw new Error('AI接続は停止しています。');
      let session = sessions.get(sessionId);
      let retired;
      if (!session) {
        if (sessions.size >= 16) {
          // This host only handles independent tools: data/replay receipts live
          // in the library, not in SDK sessions. Recreate an idle SDK session on
          // its next request, so clients killed without DELETE cannot fill slots.
          const idle = [...sessions].find(([, value]) => value.connected && value.pending.size === 0);
          if (!idle) throw new Error('AIの処理が混み合っています。少し待って同じ内容で再試行してください。');
          sessions.delete(idle[0]);
          retired = idle[1];
        }
        const pending = new Map();
        const transport = {
          async start() {},
          async close() { pending.clear(); transport.onclose?.(); },
          async send(value) {
            const reply = pending.get(value.id);
            if (reply) { try { await reply(value); } finally { pending.delete(value.id); } }
          },
        };
        const server = new Server({ name: 'tcg-local', version: '0.1.0' }, {
          capabilities: { tools: {} },
          instructions: 'TCG マネージャーを利用者の依頼に沿って操作します。最初にtcg_statusで対象ゲームとrevisionを確認し、必要なデータを読んでください。更新は新しいrequestIdとexpectedRevisionを付け、savedを確認します。通信再試行では同じ引数とrequestIdを使います。CONFLICTでは読み直し、EDIT_IN_PROGRESSでは画面の編集終了を待ちます。削除・上書きは利用者の意図を確認してください。ui_actのdispatchedは保存完了ではありません。依頼外の変更やAIクライアントの承認設定の変更はしないでください。',
        });
        server.oninitialized = onClient;
        server.setRequestHandler(ListToolsRequestSchema, async () => {
          onStage('tools');
          return { tools: operations.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })) };
        });
        server.setRequestHandler(CallToolRequestSchema, async request => {
          try {
            const result = await output(await executeOperation(request.params.name, request.params.arguments || {}));
            if (request.params.name === 'tcg_status') onStage('status');
            return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
          } catch (error) {
            return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code: error.code || 'FAILED', message: error.message }) }] };
          }
        });
        session = { server, transport, pending, connected: false };
        sessions.set(sessionId, session);
        session.ready = server.connect(transport).then(() => { session.connected = true; });
      }
      // Refresh LRU order and reserve this request before any asynchronous work.
      sessions.delete(sessionId); sessions.set(sessionId, session);
      if (Object.hasOwn(message, 'id')) session.pending.set(message.id, respond);
      if (retired) await dispose(retired);
      try {
        await session.ready;
        if (sessions.get(sessionId) === session) session.transport.onmessage(message);
      } catch (error) {
        if (sessions.get(sessionId) === session) sessions.delete(sessionId);
        await dispose(session);
        throw error;
      }
    },
    async close() {
      closed = true;
      const closing = [...sessions.values()]; sessions.clear();
      await Promise.all(closing.map(dispose));
    },
  };
}
