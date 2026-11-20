import { useRef, useState } from 'react';
import { exportLibrary, restoreLibrary, useSaveStatus } from './store.js';
import { validateLibrary } from './backup.js';
import { nativeHost } from './nativeHost.js';
import { saveNativeBlob } from './nativeFiles.js';

async function loadDataUrl(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error('付属のカード画像を読み込めず、バックアップを作れませんでした。');
  const blob = await response.blob();
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}
export function SaveStatus() {
  const status = useSaveStatus();
  if (status.kind !== 'error') return null;
  return <span role="alert" className="local-save-status error">{status.message}</span>;
}
export default function BackupControls({ close }) {
  const input = useRef();
  const [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  async function backup() {
    setBusy(true); setMessage('バックアップを作成中…');
    try {
      const snapshot = await exportLibrary(loadDataUrl);
      if (nativeHost()) {
        const result = await saveNativeBlob(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), `tcg-backup-${new Date().toISOString().slice(0,10)}.json`);
        setMessage(result.status === 'saved' ? 'バックアップを保存しました。' : '保存をキャンセルしました。'); return;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot)],{type:'application/json'}));
      const a = document.createElement('a'); a.href=url; a.download=`tcg-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setMessage('バックアップを作成しました。ダウンロード先を確認してください。');
    } catch(error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function restore(file) {
    if(!file) return;
    if(file.size>500*1024*1024) {setMessage('復元できるファイルは500MBまでです。');return;}
    setBusy(true); setMessage('バックアップを確認中…');
    try {
      const snapshot = validateLibrary(JSON.parse(await file.text()));
      const images = new Set(snapshot.games.flatMap(game=>game.cards.flatMap(card=>card.isDoubleSided ? [card.front.image,card.back.image] : [card.image])));
      for (const src of [...images].filter(Boolean)) await new Promise((resolve,reject)=>{
        const probe = new Image(); probe.onload=resolve;
        probe.onerror=()=>reject(new Error('開けない画像があるため、復元できませんでした。')); probe.src=src;
      });
      await restoreLibrary(snapshot); close();
    }
    catch(error) {setMessage(error.message);}
    finally {setBusy(false);}
  }
  return <section className="mock-section"><h3>端末保存・バックアップ</h3><SaveStatus /><p className="mock-note">{nativeHost() ? '全ゲームのデータはこの端末に自動保存されます。アプリのデータを消すと失われるため、' : '全ゲームのデータはこのブラウザに自動保存されます。ブラウザのデータを消すと失われるため、'}定期的にバックアップを保存してください。別の端末への移動にも使えます。</p><div className="mock-buttons"><button disabled={busy} onClick={backup}>画像込みバックアップ</button><button disabled={busy} onClick={()=>input.current.click()}>バックアップを復元</button></div><p className="mock-note">復元すると別のゲームとして追加され、今のデータは残ります。デッキのJSONは「保存デッキ」から読み込んでください。</p><input hidden ref={input} type="file" accept=".json" onChange={e=>{restore(e.target.files[0]);e.target.value='';}} />{message && <p role="status">{message}</p>}</section>;
}
