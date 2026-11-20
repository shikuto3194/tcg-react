import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initializeLibrary } from './local/store.js';
import { resumeAIConnection } from './automation/integration.js';
import { nativeHost } from './local/nativeHost.js';
import { installNativeDownloads } from './local/nativeFiles.js';
import './index.css';
import './local/settings.css';
import './styles/appearance.css';
document.body.classList.add('app-appearance');
installNativeDownloads();
const root = createRoot(document.getElementById('root'));
root.render(<p style={{padding:32}}>保存データを読み込み中…</p>);
async function start() {
  try {
    await initializeLibrary();
    root.render(<App />);
    resumeAIConnection();
    if (!nativeHost() && import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error);
  } catch (error) {
    root.render(<main style={{padding:32}}><h1>保存データを開けませんでした</h1><p>{error.message}</p><p>データは上書きしていません。ブラウザを通常モードで開き、端末の空き容量を確認してください。</p><button onClick={()=>location.reload()}>再読み込み</button></main>);
  }
}
// Keep one writer per origin to prevent lost updates between browser tabs.
if (navigator.locks) navigator.locks.request('tcg-local-library-writer', {ifAvailable:true}, async lock => {
  if (!lock) { root.render(<main style={{padding:32}}><h1>別のタブで開いています</h1><p>先に開いたタブを閉じてから、再読み込みしてください。</p><button onClick={()=>location.reload()}>再読み込み</button></main>); return; }
  await start();
  await new Promise(() => {});
});
else root.render(<main style={{padding:32}}>データを保存するには、最新版のChromeやEdgeで、localhostまたはHTTPSのURLから開いてください。</main>);
