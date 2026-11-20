import { useEffect, useState } from 'react';
import { startAIConnection, stopAIConnection, useAIConnection } from './connection.js';
import { nativeHost } from '../local/nativeHost.js';
import { getAISetup, configureAIClient, diagnoseAIConnection, connectionText, aiSetupPrompt, aiTaskPrompt } from './setup.js';
import { saveNativeFiles } from '../local/nativeFiles.js';
import { openWorkPlugin, saveClaudeCoworkPlugin } from './plugin.js';

export default function AIControls() {
  const state = useAIConnection();
  const [info, setInfo] = useState(null);
  const [client, setClient] = useState('other');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!nativeHost()) return;
    let active = true;
    getAISetup().then(value => { if (active) {
      setInfo(value);
      const saved = sessionStorage.getItem('tcg-ai-client');
      setClient([...value.clients, ...(value.plugins || []), { id: 'other' }].some(row => row.id === saved) ? saved : value.preferredClient || value.clients[0]?.id || 'other');
    } })
      .catch(error => { if (active) setError(String(error.message || error)); });
    return () => { active = false; };
  }, []);
  const run = async action => {
    setBusy(true); setMessage(''); setError('');
    try { await action(); }
    catch (error) { setError(String(error.message || error)); }
    finally { setBusy(false); }
  };
  const copy = (text, nextStep) => run(async () => {
    await navigator.clipboard.writeText(text);
    setMessage(nextStep);
  });
  const automatic = info?.clients.find(row => row.id === client);
  const plugin = info?.plugins?.find(row => row.id === client);
  const disabled = busy || state.busy;
  const setup = () => run(async () => {
    const result = await configureAIClient(client);
    const started = await startAIConnection();
    setMessage(`${result.client}の接続設定を保存しました。${started ? 'AIアプリを開き直し、「作業を頼む文章をコピー」へ進んでください。' : '接続を開始できませんでした。エラーの案内を確認してください。'}`);
  });
  const preparePlugin = () => run(async () => {
    if (client === 'Claude Cowork') {
      const result = await saveClaudeCoworkPlugin();
      setMessage(result.status === 'saved' ? 'プラグインを保存しました。Claude Coworkの「カスタマイズ → プラグイン」でこのZIPを追加し、「AIとの接続を開始」を押してください。' : 'プラグインの保存を取り消しました。');
    } else {
      await openWorkPlugin();
      setMessage(`導入画面を開きました。AIアプリ側でインストールしてください。${state.connected ? 'TCGの待受は開始済みです。' : '追加後、ここに戻って「AIとの接続を開始」を押してください。'}`);
    }
  });
  return <section className="mock-section" data-ai-private><h3>AI連携</h3>
    <p>AIにカードの整理・デッキ作り・戦績の確認を頼めます。</p>
    <label className="mock-stack">1. 使うAIアプリ<select value={client} disabled={disabled} onChange={event => { setClient(event.target.value); sessionStorage.setItem('tcg-ai-client', event.target.value); setMessage(''); setError(''); }}>
      {info?.clients.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      {info?.plugins?.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      <option value="other">ほかのAIアプリ（自分で接続設定）</option>
    </select></label>
    {client === 'codex' && <p className="mock-note">Codexのプラグインを使う場合は「Codex / ChatGPT Work（プラグイン）」を選んでください。ここでは直接接続を登録します。</p>}
    <p><strong>2. 接続する</strong></p>
    {automatic ? <><p className="mock-note">初めて：下のボタンを押し、{automatic.name}を開き直してください。</p><button type="button" disabled={disabled} onClick={setup}>{automatic.name}に接続を登録</button>
      {!state.connected && <p className="mock-note">登録済み：「AIとの接続を開始」を押してください。</p>}</>
      : plugin ? <>
        <p className="mock-note">{client === 'Claude Cowork' ? '初めて：連携用のZIPを保存し、Claude Coworkに追加します。' : '初めて：導入画面を開き、Codex / ChatGPT Workに連携機能を追加します。'}</p>
        <button type="button" disabled={disabled} onClick={preparePlugin}>{client === 'Claude Cowork' ? 'Claude Cowork用プラグインを保存' : 'プラグインの導入画面を開く'}</button>
        <details><summary>追加の手順を見る</summary>
          {client === 'Claude Cowork' ? <p>ZIPを保存したら、Claude Coworkの「カスタマイズ → プラグイン」で追加してください。ZIPを解凍する必要はありません。</p> : <p>導入画面でプラグインをインストールしてください。PCを実行先にした会話で使います。</p>}
          <p>{state.connected ? 'TCGの待受は開始済みです。' : '追加が終わったら、この画面に戻って接続を開始します。'}</p>
        </details>
        {!state.connected && <p className="mock-note">追加済み：「AIとの接続を開始」を押してください。</p>}
      </> : <p className="mock-note">「AIとの接続を開始」を押すと、設定の案内が表示されます。対応するAIアプリが必要です。</p>}
    <div className="mock-buttons">
      <button type="button" disabled={disabled} onClick={() => run(state.connected ? stopAIConnection : startAIConnection)}>{state.connected ? 'AIとの接続を停止' : 'AIとの接続を開始'}</button>
      <button type="button" disabled={disabled} onClick={() => copy(aiTaskPrompt, `文章をコピーしました。AIアプリに貼り付け、「依頼：」の後に頼みたいことを書いてください。${state.connected ? '' : '実行する前に「AIとの接続を開始」を押してください。'}`)}>作業を頼む文章をコピー</button>
    </div>
    {!plugin && <>
      <button type="button" disabled={disabled || (!automatic && !state.connected)} onClick={() => copy(aiSetupPrompt(info, client, state), '接続を設定する文章をコピーしました。設定を操作できるAIに貼り付けて送信してください。')}>接続を設定する文章をコピー</button>
      <p className="mock-note">{!automatic && !state.connected ? '接続設定用の文章は「AIとの接続を開始」を押すとコピーできます。' : '接続の準備をAIに頼むときに使います。カードやデッキは変更しません。'}</p>
    </>}
    {state.connected && <>
      <p><strong>3. AIに頼む</strong><br /><span className="mock-note">「作業を頼む文章をコピー」を押し、AIアプリに貼り付けます。「依頼：」の後に頼みたいことを書いてください。例：「このデッキの改善案を教えて」。</span></p>
      {plugin && <p className="mock-note">{client === 'work' ? 'PCを実行先にした新しい会話で使ってください。' : 'Claude Coworkで新しい会話を開いて使ってください。'}</p>}
      <p role="status">{state.clientSeen ? 'AIからの接続を確認しました。' : '接続待ちです。AIアプリでTCGを使うと、接続を確認できます。'}<br /><span className="mock-note">送信前にこの設定画面を閉じてください。TCG マネージャーは開いたまま使います。</span></p>
      <p className="mock-note">アプリの待受：開始済み。MCP認証・初期化：{state.clientSeen ? '確認済み' : '未確認'}。ツール一覧の要求：{state.toolsSeen ? '受信済み' : '未確認'}。tcg_status：{state.statusSeen ? '成功確認済み' : '未確認'}。AIの会話で使えるかは、その会話からtcg_statusを呼んで確認してください。</p>
      {(!automatic && !plugin) && <p className="mock-note">初めて使うAIは、次の案内で接続を設定してください。</p>}
      <details key={client} open={!automatic && !plugin}><summary>{automatic || plugin ? '接続できないとき' : 'AIアプリに接続を設定する'}</summary>
        <p className="mock-note">待受は開始済みです。ツールが見えない場合はAI側の登録・プラグインの有効状態と起動エラーを確認し、新しい会話で試してください。認証エラーなら接続ファイルの参照先を確認します。</p>
        {nativeHost() && <button type="button" disabled={disabled} onClick={() => run(async () => {
          const result = await diagnoseAIConnection();
          setMessage(`${result.listening ? '待受は開始済み。' : '待受は停止中。'}${result.fileMatches ? '接続ファイルは現在の待受と一致しています。' : '接続ファイルが現在の待受と一致しません。保存先とAI側の登録先を確認してください。'} 保存先: ${result.connectionFile}。${result.fileError || ''} ${result.toolAvailability}`);
        })}>接続ファイルを確認</button>}
        {plugin ? <p className="mock-note">AIアプリでプラグインを有効にし、新しい会話を開いてください。TCG マネージャーのインストール先を変えた場合は、上のボタンから連携機能を追加し直してください。</p> : <>
        <p className="mock-note">{automatic ? 'まずAIアプリを開き直してください。それでも接続できない場合は「接続を設定する文章をコピー」で、設定を操作できるAIに接続の準備を頼めます。' : '設定を操作できるAIには「接続を設定する文章をコピー」で準備を頼めます。できない場合は「接続先・キーを手動で入力する」を開いてください。'}</p>
        <p className="mock-note">AIへのログインや許可の操作は、自分で行ってください。</p>
        <details><summary>接続先・キーを手動で入力する</summary>
          <label className="mock-stack">接続先<input readOnly value={state.url} /></label>
          <label className="mock-stack">接続用キー<input readOnly type="password" value={state.token} onFocus={event => event.target.select()} /></label>
          <div className="mock-buttons"><button type="button" disabled={disabled} onClick={() => copy(connectionText(state), '接続情報をコピーしました。AIアプリの接続設定に貼り付けてください。')}>接続情報をまとめてコピー</button><button type="button" disabled={disabled} onClick={() => copy(state.token, '接続用キーをコピーしました。AIアプリの接続設定に貼り付けてください。')}>接続用キーだけコピー</button></div>
        </details>
        <p className="mock-note">接続情報にはデータの確認・変更を許すキーを含みます。使うAI以外には渡さないでください。停止すると接続できなくなります。</p>
        </>}
      </details>
    </>}
    <details><summary>詳しく見る</summary>
      <p><strong>次回からの使い方</strong><br />TCG マネージャーを開き、「AIとの接続を開始」を押します。登録や連携機能の追加は、毎回行う必要はありません。使い終わったら「AIとの接続を停止」を押します。</p>
      <p><strong>接続の仕組み</strong><br />{automatic ? '登録ボタンは、選んだAIアプリにTCGの接続先を追加し、TCG側の受け付けを始めます。ほかの設定は残し、変更前の設定も保管します。' : plugin ? 'プラグインは、AIアプリにTCGを操作するための連携機能を追加します。追加しただけでは接続は始まりません。' : '同じ端末のローカルMCP（アプリ同士をつなぐ仕組み）に対応するAIアプリが必要です。Android・Web版では接続設定を自動で登録できません。'}</p>
      <p>「開始」は、AIからの接続を受け付ける操作です。AIが実際にアクセスすると「AIからの接続を確認しました」と表示します。AIが今も動いていることを保証する表示ではありません。</p>
      <p>接続だけではカードやデッキは変わりません。AIに依頼を送り、必要な許可をAIアプリ側で行って使います。</p>
      {plugin && <p>このプラグインはWindowsの同じPC用です。通常のChat・クラウドだけの実行・Androidには使えません。組織でローカルMCPが禁止されている場合は、管理者に確認してください。</p>}
      {client === 'work' && <p>CodexにTCGの接続を登録済みなら、その接続も使えます。登録済みの接続とプラグインは、どちらか一方を使ってください。</p>}
    </details>
    {message && <p role="status">{message}</p>}
    {(error || state.error) && <p role="alert">{error || state.error}</p>}
    {!!state.files.length && <><h3>AIが作成したファイル</h3>{state.files.map(file => <p key={file.path}>{file.name} {!nativeHost() && file.path}</p>)}{nativeHost() && <>
      {state.files.length > 1 && <p className="mock-note">保存先を一度選ぶと、新しい出力フォルダに全ファイルを保存します。</p>}
      <button type="button" disabled={disabled} onClick={() => run(async () => { const result = await saveNativeFiles(state.files); setMessage(result.status === 'saved' ? `${state.files.length}件を保存しました。` : '保存を取り消しました。'); })}>{state.files.length > 1 ? 'まとめて保存' : '保存先を選ぶ'}</button>
    </>}</>}
  </section>;
}
