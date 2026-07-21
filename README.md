# VIC - VTuber Introduction Center -

VIC公開サイト・登録ページ・管理画面の完成版です。

## 公開ページ
- `index.html` 本日のおすすめVTuber
- `register.html` 初回登録／おすすめ追加
- `admin.html` 管理者専用画面

## 管理画面でできること
- 管理パスワードによるログイン
- 申請の確認・承認・掲載不可
- 公開VTuberの編集・公開／非公開・削除
- 公開おすすめ動画の編集・公開／非公開・削除

## 更新手順
1. Apps Scriptのコードを `AppsScript-Code.gs` に全置換して保存。
2. スプレッドシートを再読み込み。
3. `VIC → 管理パスワードを設定` で8文字以上のパスワードを設定。
4. `デプロイ → デプロイを管理 → 鉛筆 → 新バージョン → デプロイ`。
5. GitHubへ `admin.html`、`admin.js`、更新済み `styles.css` を含むサイトファイルを上書きアップロード。
6. `https://pandemichearts2-wq.github.io/VIC/admin.html` を開いてログイン。

`config.js` には現在のVIC Apps Script URLを設定済みです。
