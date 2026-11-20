# アプリアイコン

正本は [`public/icon.svg`](../../public/icon.svg)。青い角丸の背景、白いカード、中央の四方向の星をSVGの図形で構成する。このプロジェクトのWeb版用に作成されたアイコン（初出コミット `751d86c`）をWindows・Androidでも使用する。外部の画像、フォント、Tauriのロゴは含まない。

2026年10月10日、ネイティブ版に残っていたTauriの初期アイコンを置き換えた。第三者商標との網羅的な類似調査を実施したという意味ではない。

再生成はプロジェクトルートで行う。

```powershell
node node_modules/@tauri-apps/cli/tauri.js icon public/icon.svg --output .codex-temp/app-icons
```

出力直下のPNG・ICO・ICNSのうち、このフォルダで管理している同名ファイルを置き換える。`android/`以下は`src-tauri/gen/android/app/src/main/res/`へ反映する。iOS向けの生成物は使用しない。Androidは生成された`mipmap-anydpi-v26/ic_launcher.xml`から新しい前景PNGと背景色を参照し、旧テンプレートのdrawableは使わない。

表示名は「TCG マネージャー」。既存の保存領域とAI接続を引き継ぐため、アプリID `local.tcg.manager`、Androidの`.debug`接尾辞、実行ファイル名`tcg-local.exe`は維持する。

Windowsのタイトルバーとタスクバーは別のアイコンを使う。Tauri runtime 2.12.1／Tao 0.37.1の標準設定は小さいウィンドウアイコンのみを設定するため、`src/taskbar.rs`でexe内のICOリソース32512を共有ハンドルとして読み、`WM_SETICON / ICON_BIG`も設定する。ウィンドウのAppUserModel ID・再起動先・アイコン参照を明示し、`tauri.windows.conf.json`で同じICOを`tcg-manager-card.ico`として同梱する。NSISのインストール後フックは、このexeを指す既存ショートカットのアイコンとIDを更新する。アイコンキャッシュの削除だけには依存しない。
