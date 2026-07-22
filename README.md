# VIC FA機能統合版

通常FA・成人向けFAの閲覧／投稿、管理画面での承認・一括処理・公開FA編集・画像ダウンロードに対応しています。

## 更新
- GitHub: ZIP内のファイルをすべて上書き
- Apps Script: AppsScript-Code.gsへ全置換し、setupSheetsを一度実行後、新バージョンで再デプロイ

## 追加シート
- VIC_FA確認待ち
- VIC公開FA
- VIC公開成人向けFA

通常FAと成人向けFAを合計2500件まで保管し、上限超過時は古い公開FAから同数をGoogle Driveのゴミ箱へ移します。
