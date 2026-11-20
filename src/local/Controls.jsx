import { addField, fieldInUse, numberOf } from './cardFields.js';
import { sidesOf, nextSideColor, nextSideName } from './sideDecks.js';
import BackupControls, { SaveStatus } from './BackupControls.jsx';
import { useEffect, useRef, useState } from 'react';
import { applySettings, getLocalSettings, importCardFiles, keysOf, useLocal, valueOf, getLocalStorage } from './store.js';
import { parseCardData } from './importData.js';
import CardAddForm from './CardAddForm.jsx';
import { AIControls, aiEnabled } from '../automation/integration.js';
import { nativeHost } from './nativeHost.js';
import { pickNativeFolder } from './nativeFiles.js';
import { comparePacks } from '../utils/deckPacks.js';

function SettingsDialog({ close, onDataChange, onSettingsChange }) {
  const { settings, name, cards } = useLocal();
  const [gameName, setGameName] = useState(name);
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [section, setSection] = useState('');
  const ref = useRef(null);
  const filesRef = useRef(null);
  const folderRef = useRef(null);
  const storedDecks = [...JSON.parse(getLocalStorage().getItem('savedCanvasDecks') || '[]'), JSON.parse(getLocalStorage().getItem('draft') || '{}')];
  const sideInUse = id => storedDecks.some(deck => (sidesOf(deck)[id] || []).some(card => card.count > 0));
  const selectFolder = async () => {
    if (!nativeHost()) { folderRef.current.click(); return; }
    setBusy(true);
    try { await loadFiles(await pickNativeFolder()); }
    catch (error) { setFeedback(String(error.message || error)); }
    finally { setBusy(false); }
  };
  useEffect(() => { ref.current.showModal(); }, []);

  async function loadFiles(files) {
    if (!files.length) return;
    const selected = [...files].filter(file => /\.(png|jpe?g|webp|gif|csv|json)$/i.test(file.name));
    if (!selected.length) { setFeedback('画像（PNG・JPEG・WebP・GIF）か、カードデータ（CSV・JSON）を選んでください。'); return; }
    if (selected.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) { setFeedback('1回に読み込めるのは合計100MBまでです。'); return; }
    setBusy(true); setFeedback('読み込み中…');
    try {
      const images = [], rows = [];
      for (const file of selected) {
        const path = file.webkitRelativePath || file.name;
        if (/\.(csv|json)$/i.test(file.name)) rows.push(...parseCardData(await file.text(), path));
        else {
          const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
          await new Promise((resolve, reject) => { const probe = new Image(); probe.onload = resolve; probe.onerror = () => reject(new Error(file.name + ' は画像として開けません。')); probe.src = image; });
          images.push({ path, image });
        }
      }
      const beforeKeys = keysOf(getLocalSettings());
      const result = importCardFiles(images, rows);
      // 読込で増えた項目だけを設定中の下書きへ追加する。
      const imported = getLocalSettings();
      setDraft(previous => {
        const added = keysOf(imported).filter(key => !beforeKeys.includes(key) && !keysOf(previous).includes(key));
        return { ...previous, fieldKeys: [...keysOf(previous), ...added], labels: [...previous.labels, ...added.map(key => imported.labels[keysOf(imported).indexOf(key)])] };
      });
      setFeedback(`カードを${result.added}件追加し、カード情報を${result.updated}件読み込みました。${files.length > selected.length ? `対応していないファイル${files.length - selected.length}件は読み込んでいません。` : ''}`);
      onDataChange();
    } catch (error) { setFeedback(`読み込めませんでした。データは変更していません。${error.message}`); }
    finally { setBusy(false); }
  }

  return <dialog ref={ref} className="mock-settings" onCancel={event => { event.preventDefault(); if (!busy) close(); }} aria-labelledby="mock-settings-title">
    <div className="mock-settings-header"><h2 id="mock-settings-title">{section || '設定'}</h2><button type="button" onClick={close} disabled={busy}>閉じる</button></div>
    {section ? <button type="button" className="local-settings-back" onClick={() => { setSection(''); setFeedback(''); }} disabled={busy}>設定メニューに戻る</button> : <>
      <p className="mock-notice">カード・設定・デッキはゲームごとに保存されます。</p>
      <nav className="local-settings-menu" aria-label="設定メニュー">{['ゲーム設定', 'カード追加', 'バックアップ', ...(aiEnabled ? ['AI連携'] : [])].map(name => <button key={name} type="button" onClick={() => { setSection(name); setFeedback(''); }}><span>{name}</span><span aria-hidden="true">›</span></button>)}</nav>
    </>}
    <div hidden={section !== 'ゲーム設定'}>
    <form onSubmit={event => { event.preventDefault(); try { applySettings({ ...draft, labels: draft.labels.map((label, i) => label.trim() || `項目${numberOf(keysOf(draft)[i])}`) }, gameName); onSettingsChange(); close(); } catch (error) { setFeedback(error.message); } }}>
      <section className="mock-section"><h3><label htmlFor="mock-game-name">ゲーム名</label></h3><div className="mock-stack"><input id="mock-game-name" type="text" required maxLength={60} value={gameName} onChange={event => setGameName(event.target.value)} /></div></section>
      <section className="mock-section"><h3>カードサイズ</h3><div className="mock-field-names"><label><span>幅（mm）</span><input type="number" required min="1" max="190" step="0.1" value={draft.cardSize.width} onChange={event => setDraft({ ...draft, cardSize: { ...draft.cardSize, width: event.target.value } })} /></label><label><span>高さ（mm）</span><input type="number" required min="1" max="277" step="0.1" value={draft.cardSize.height} onChange={event => setDraft({ ...draft, cardSize: { ...draft.cardSize, height: event.target.value } })} /></label></div><p className="mock-note">PDFには、デッキの枚数分をこのサイズで並べます。PNG／SVGも同じ縦横比になります。印刷は「実際のサイズ」か「100%」を選んでください。</p></section>
      <section className="mock-section"><h3>サイドデッキ（{(draft.sideDecks || []).length}個）</h3>
        <p className="mock-note">ゲーム内で共通の名前を使います。カードが入っているサイドデッキは削除できません。</p>
        {(draft.sideDecks || []).map((side, index) => <div className="side-deck-setting" key={side.id} style={{ borderLeft: `5px solid ${side.color}`, paddingLeft: 8 }}><label className="mock-stack">サイドデッキ{index + 1}の表示名<input required maxLength={40} value={side.name} onChange={event => setDraft(previous => ({ ...previous, sideDecks: previous.sideDecks.map(item => item.id === side.id ? { ...item, name: event.target.value } : item) }))} /></label><button type="button" aria-label={`サイドデッキ${index + 1}を削除`} disabled={sideInUse(side.id)} title={sideInUse(side.id) ? 'カードが入っています' : '未使用のサイドデッキを削除'} onClick={() => setDraft(previous => ({ ...previous, sideDecks: previous.sideDecks.filter(item => item.id !== side.id) }))}>削除</button></div>)}
        <button type="button" onClick={() => setDraft(previous => ({ ...previous, sideDecks: [...(previous.sideDecks || []), { id: `side-${crypto.randomUUID()}`, name: nextSideName(previous.sideDecks || []), color: nextSideColor(previous.sideDecks || []) }] }))}>サイドデッキを追加</button>
      </section>
      <section className="mock-section"><h3>項目の表示名</h3><p>項目名を変え、未使用の項目を削除できます。「＋」で追加できます。</p><div className="mock-field-names">{draft.labels.map((label, i) => {
        const key = keysOf(draft)[i], number = numberOf(key), used = fieldInUse(cards, key, draft.source);
        return <div className="field-setting" key={key}><label><span>項目{number}</span><input type="text" value={label} maxLength={24} placeholder={`項目${number}`} onChange={event => setDraft({ ...draft, labels: draft.labels.map((previous, index) => index === i ? event.target.value : previous) })} /></label><button type="button" aria-label={`項目${number}を削除`} disabled={used} title={used ? 'カードの値またはセット名に使っています' : '未使用の項目を削除'} onClick={() => setDraft(previous => ({ ...previous, fieldKeys: keysOf(previous).filter(item => item !== key), labels: previous.labels.filter((_, index) => keysOf(previous)[index] !== key) }))}>削除</button></div>;
      })}</div><button type="button" className="mock-add-field" aria-label="項目を追加" disabled={draft.labels.length >= 100} onClick={() => setDraft(previous => addField(previous))}>＋</button><p className="mock-note">カードに値がある項目と、セット名に使う項目は削除できません。残る項目の番号や値は変わりません。</p></section>
      <section className="mock-section"><h3>収録セット</h3><p>「第1弾」などのセット名でカードをまとめ、検索できます。</p><label className="mock-stack">セット名に使うもの<select value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })}><option value="folder">画像のフォルダ名</option>{keysOf(draft).map((key, i) => <option key={key} value={key}>{draft.labels[i] || `項目${i + 1}`}</option>)}</select></label><p className="mock-note">「第1弾」フォルダ内の画像は「第1弾」になります。ファイルだけを選ぶと未設定です。項目を使う場合は、カードの「編集」でその項目にセット名を入力してください。</p></section>
      <div className="mock-settings-actions"><button type="button" className="mock-cancel" onClick={close} disabled={busy}>キャンセル</button><button type="submit" disabled={busy}>設定を保存</button></div>
      {section === 'ゲーム設定' && feedback && <p role="alert">{feedback}</p>}
    </form>
    </div>
    <div hidden={section !== 'カード追加'}>
    <section className="mock-section"><h3>カードデータを読み込む</h3><p>画像だけで始められます。カード名・項目・テキストはCSV／JSONでまとめて登録できます。</p><div className="mock-buttons"><button disabled={busy} onClick={() => filesRef.current.click()}>ファイルを選ぶ</button><button disabled={busy} onClick={selectFolder}>フォルダを選ぶ</button></div><p className="mock-note">画像はPNG・JPEG・WebP・GIF、データはUTF-8のCSV・JSONに対応。1回100MBまで。読み込むとすぐに保存されます。同じ場所・名前の画像は、同じカードとして更新します。</p>
      <details><summary>カードデータの書式例</summary><p className="mock-note">imageにはCSV／JSONから見た画像の場所を書きます（例：第1弾/カードA.png）。画像は一緒に選ぶか、先に読み込んでください。item1〜itemNは項目1〜Nです。列を省くと元の値が残り、空欄にすると消えます。ownedCountは所持枚数です（空欄：未入力）。limitはデッキに入れられる枚数です（空欄：上限なし／0：入れられない）。</p><p className="mock-note">CSVの例（1行目は見出し）</p><pre className="mock-format">{'image,name,item1,item2,effect,limit\n第1弾/カードA.png,カードA,3,戦士,カードの説明,'}</pre><p className="mock-note">JSONの例</p><pre className="mock-format">{'[{"image":"第1弾/カードA.png","name":"カードA","item1":"3","item2":"戦士","effect":"カードの説明","limit":""}]'}</pre><p className="mock-note">画像なしで追加する場合はimageとidを空欄にし、nameを必ず入力してください。読み込むたびに新しいカードになります。更新には、カード詳細に表示されるIDを使ってください。</p><pre className="mock-format">{'name,item1,item5,item6,effect\n炎の守り手,赤,3,5000,味方1体を守る。'}</pre><p className="mock-note">cardNumberはカード番号、idは登録済みカードのID（imageの代わり）、sideは両面カードの表（front）か裏（back）です。必要なものだけ指定できます。画像のURL・Excel・ZIPは読み込めません。デッキJSONは「保存デッキ」から読み込んでください。</p></details>
      <input ref={filesRef} hidden type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.csv,.json" multiple onChange={event => { loadFiles(event.target.files); event.target.value = ''; }} /><input ref={folderRef} hidden type="file" webkitdirectory="" multiple onChange={event => { loadFiles(event.target.files); event.target.value = ''; }} />{feedback && <p role="status">{feedback}</p>}
    </section>
    <CardAddForm onAdded={onDataChange} />
    </div>
    <div hidden={section !== 'バックアップ'}><BackupControls close={close} /></div>
    {aiEnabled && <div hidden={section !== 'AI連携'}><AIControls /></div>}
  </dialog>;
}
export function LocalControls({ onDataChange, onSettingsChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  return <><SaveStatus /><button disabled={disabled} onClick={() => setOpen(true)} title={disabled ? "所持枚数の編集を完了するか、キャンセルしてください。" : "設定・カードの読み込み"} style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5em 1em', fontSize: '0.9em', cursor: 'pointer', whiteSpace: 'nowrap', width: '6em' }}>設定</button>{open && <SettingsDialog close={() => setOpen(false)} onDataChange={onDataChange} onSettingsChange={onSettingsChange} />}</>;
}
export function LocalFilters({ cards, values, setValues, pack, setPack, ownershipFilter = '', setOwnershipFilter }) {
  const { settings } = useLocal();
  const keys = keysOf(settings);
  const faces = cards.flatMap(card => card.isDoubleSided ? [card.front, card.back] : [card]);
  const packs = [...new Set(faces.map(face => face.pack).filter(Boolean))].sort(comparePacks);
  const item = (key, i) => <div key={key}><label htmlFor={`mock-filter-${i}`}>{settings.labels[i]}</label><select id={`mock-filter-${i}`} value={values[key] || ''} onChange={event => setValues({ ...values, [key]: event.target.value })} style={{ width: '100%' }}><option value="">(指定なし)</option>{[...new Set(faces.map(face => valueOf(face, key)).filter(Boolean))].map(value => <option key={value}>{value}</option>)}</select></div>;
  return <div className="filter-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7em 1em', marginBottom: '1em', fontSize: '0.97em' }}>{keys.slice(0, 4).map(item)}<div><label htmlFor="mock-pack" title="フォルダ名か項目の値をセット名に使います">収録セット</label><select id="mock-pack" value={pack} onChange={event => setPack(event.target.value)} style={{ width: '100%' }}><option value="">(指定なし)</option>{packs.map(value => <option key={value}>{value}</option>)}</select></div>{keys.slice(4).map((key, i) => item(key, i + 4))}{setOwnershipFilter && <div><label htmlFor="ownership-filter">所持状況</label><select id="ownership-filter" value={ownershipFilter} onChange={event => setOwnershipFilter(event.target.value)} style={{ width: '100%' }}><option value="">(指定なし)</option><option value="owned">所持あり</option><option value="zero">0枚</option><option value="unknown">未入力</option><option value="shortage">不足あり</option></select></div>}</div>;
}
