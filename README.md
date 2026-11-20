# TCG マネージャー

オリカマネージャーやACGマネージャーを汎用化し、どのようなカードゲームにも対応できるようにしたWindowsアプリです。
手持ちのカード画像やカード情報を取り込んで、複数のカードゲームの所持枚数・デッキ・戦績を一か所で管理するPC向けのローカルアプリです。Windows版をBOOTHで配布しています。

[BOOTHの商品ページ](https://shikuto3194.booth.pm/items/8965497)

## PCでの操作画面

### 戦績グラフ

記録した対戦結果から、日ごとの勝率の推移や勝敗の内訳を確認できます。画面はサンプルデータです。[グラフの実装](src/analysis/ResultsChart.jsx)

![PC画面で勝率の推移と対戦履歴を確認](screenshots/pc-win-rate.webp)

### MCPによるAI連携

Windows版では、MCPを介してAIアプリからカードの整理、デッキ作成、戦績の確認を依頼できます。接続の開始・停止は設定画面から操作します。[接続設定の画面実装](src/automation/AIControls.jsx)

![Windows版のAI連携設定でMCPの接続状況を確認](screenshots/pc-mcp.webp)

### カード検索

カード名やテキストで検索し、絞り込みや表示切り替えを使いながら採用枚数を調整できます。

![PC版のカード検索。左に検索と絞り込み、右にカード一覧](screenshots/pc-card-search.webp)

### デッキ構築

メインデッキとサイドデッキの内訳を見ながら、カードの枚数を調整し、デッキを保存できます。

![PC版のデッキ構築。左にデッキの内訳と保存操作、右に採用カード](screenshots/pc-deck-builder.webp)

## できること

- カード画像やCSV・JSONを取り込み、ゲームごとに項目やセット名を設定する。
- 所持枚数を記録し、デッキの構築に必要なカードを確認する。
- メイン・サイドデッキを作成し、JSON・画像・印刷用PDFへ出力する。
- 対戦結果を記録し、ゲームやデッキごとに戦績を確認する。

## 設計の工夫

- **画像とゲーム情報を分けてローカルに保存する。** IndexedDBでストアを分け、カード画像に変更がなければ書き込みを省きます。ゲーム情報と画像をまとめてバックアップでき、旧形式の読み込みもテストしています。[ローカル保存](src/local) · [保存・移行のテスト](src/local/persistence.test.js)
- **保存と印刷を共通のデッキデータから扱う。** サイドデッキを含む構成を保存し、JSON・画像・PDFに出力します。PDFの処理は操作時に読み込み、初回の読み込みに混ざっていないことを検査します。[出力処理](src/local/exports.js) · [配布物の検査](scripts/check-distribution.mjs)
- **Reactの画面をWindowsアプリとして提供する。** Tauriを使い、カードやデッキのファイル操作をWindowsの機能につなぎます。[Tauriのソース](src-tauri)

## 開発で担当したこと

個人開発として、目的と仕様の整理、AIへの実装指示、改善方針の判断、動作確認を担当しました。コード作成にはAIを活用しています。

**主な技術**　JavaScript、React、Vite、Tauri、Rust、IndexedDB、jsPDF

## Web版をローカルで確認する

Node.js 22.12以降の22系を使用します。

```sh
npm ci --ignore-scripts
npm run dev
```

公開用のソーススナップショットです。配布版の入手と利用条件はBOOTHの商品ページを参照してください。[第三者ライセンス](distribution/licenses)

## 関連作品

- [幻想符 Simulator](https://github.com/shikuto3194/orica-simulator-interview)
- [ACGマネージャー](https://github.com/shikuto3194/acg-react-interview)
- [オリカマネージャー](https://github.com/shikuto3194/orika-react-interview)
