import { useState } from 'react';
import '../styles/modal.css';
import { nativeHost } from '../local/nativeHost.js';
import { openNativeFile, saveNativeFiles } from '../local/nativeFiles.js';

export default function ExportFilesModal({ open, title, files, onClose }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (!open) return null;
  const safeFiles = Array.isArray(files) ? files : [];
  const native = nativeHost();
  const close = () => { if (!busy) { setMessage(''); setError(''); onClose(); } };
  const saveAll = async () => {
    if (busy) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const outputs = [];
      for (const file of safeFiles) {
        const response = await fetch(file.url);
        if (!response.ok) throw new Error('出力ファイルを読み込めませんでした。');
        outputs.push({ name: file.name, blob: await response.blob() });
      }
      const result = await saveNativeFiles(outputs);
      setMessage(result.status === 'saved' ? `${outputs.length}件を保存しました。` : '保存を取り消しました。');
    } catch (error) { setError(String(error.message || error)); }
    finally { setBusy(false); }
  };
  return (
    <div className="efm-overlay" onClick={close}>
      <div className="efm-content" onClick={(e) => e.stopPropagation()}>
        <div className="efm-header">
          <h3>{title || '出力ファイル'}</h3>
          <button className="efm-close" disabled={busy} onClick={close}>閉じる</button>
        </div>
        <div className="efm-hint">
          {native ? '保存先を一度選ぶと、新しい出力フォルダに全ファイルを保存します。「開く」で対応アプリを起動できます。' : 'ファイルごとに「保存」を押してください。iPhone／iPadでは「開く」から保存できます。'}PDFの印刷は「実際のサイズ」か「100%」を選びます。
        </div>
        {native && safeFiles.length > 0 && <p><button className="efm-open-btn" disabled={busy} onClick={saveAll}>{busy ? '保存中…' : 'まとめて保存'}</button></p>}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        {safeFiles.length === 0 ? (
          <div className="efm-empty">保存できるファイルがありません。</div>
        ) : (
          <div className="efm-file-list">
            {safeFiles.map((f, idx) => (
              <div key={f.url || idx} className="efm-file-item">
                <div className="efm-file-name">{f.name || `file-${idx + 1}`}</div>
                <div className="efm-file-actions">
                  {!native && <a className="efm-open-btn" href={f.url} download={f.name}>保存</a>}
                  <button
                    className="efm-open-btn"
                    disabled={busy}
                    onClick={async () => {
                      if (nativeHost()) {
                        try { await openNativeFile(f.url, f.name); }
                        catch (error) { alert(`開けませんでした。対応アプリを確認してください。${error.message || error}`); }
                        return;
                      }
                      try {
                        window.open(f.url, '_blank', 'noopener,noreferrer');
                      } catch {
                        window.location.href = f.url;
                      }
                    }}
                  >
                    開く
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
