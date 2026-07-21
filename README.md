# VIC - VTuber Introduction Center -

このフォルダは、VIC専用の完成版サイト一式です。
`config.js` には、発行済みのApps ScriptウェブアプリURLを設定済みです。

## 入っている機能

- 明るい暖色のヒーロー
- 本日のおすすめVTuber
- おすすめ動画のYouTubeサムネイル表示
- 初回登録（指定された7項目のみ）
- 登録済みVTuberへの「おすすめ動画リンク・おすすめポイント」追加
- `Stream.mp3` を使ったBGM再生／停止
- スプレッドシート上での承認・却下

## GitHubへアップロードするファイル

次のファイルを、新しいVIC用リポジトリの直下へアップロードしてください。

- `index.html`
- `register.html`
- `styles.css`
- `app.js`
- `register.js`
- `config.js`
- `Stream.mp3`

`AppsScript-Code.gs` はGitHubではなく、VIC用スプレッドシートのApps Scriptで使用します。
すでに同じコードを貼り付け、`setupSheets`を実行してウェブアプリをデプロイ済みなら、貼り直しは不要です。

## GitHub Pagesの設定

1. リポジトリの `Settings` を開く
2. `Pages` を開く
3. Sourceを `Deploy from a branch` にする
4. Branchを `main`、フォルダを `/(root)` にする
5. `Save` を押す

## 申請の承認

1. スプレッドシートの `VIC確認待ち` を開く
2. 承認したい申請の行を選択する
3. 上部メニューの `VIC` → `選択中の申請を承認` を押す

初回登録を承認すると、VTuber情報と最初のおすすめが同時に公開されます。
追加申請を承認すると、おすすめ動画リンクとおすすめポイントだけが追加されます。

## サムネイルについて

おすすめ動画はYouTube動画URLに対応しています。
通常動画、`youtu.be`、Shorts、ライブ、埋め込みURLから動画IDを取得してサムネイルを表示します。
