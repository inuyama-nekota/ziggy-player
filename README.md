# ZIGGY PLAYER（Web版）

iPhoneのSafariで使う、個人用の3曲プレイヤーです。音源・歌詞・動画はGitHubへ送らず、端末内にだけ保存します。

## iPhoneでの使い方

1. Safariで公開ページを開く。
2. 歯車ボタンを押し、「ZIGGYフォルダを選ぶ」を押す。
3. iCloud Drive内の「ZIGGY」フォルダを選ぶ。
4. 自動照合されたファイルを確認し、「3曲をこのiPhoneに保存」を押す。

フォルダ選択が表示されない古いiOSでは、「ファイルをまとめて選ぶ」からM4A・LRC・MP4をまとめて選択します。

## 素材の配置

```text
iCloud Drive/ZIGGY/
  01 STAY GOLD.m4a
  STAY GOLD.lrc
  STAY GOLD.mp4
  04 GLORIA.m4a
  gloria.lrc
  GLORIA.mp4
  01 I'M GETTIN' BLUE.m4a
  im_gettin_blue.lrc
  I'M GETTIN' BLUE.mp4
```

先頭の曲番号、空白、ハイフン、アンダースコア、大文字・小文字の違いは無視して照合します。

## 主な機能

- 曲名だけの縦リール（STAY GOLD / GLORIA / I'M GETTIN' BLUE）
- メタリックな再生・一時停止ボタン
- LRC同期歌詞を常時3行表示し、現在行を中央太字
- MP4を背景全面で表示し、音源の再生・停止・シークへ同期
- M4A・LRC・MP4をファイル名から自動照合
- IndexedDBへ端末内保存

## 主要ファイル

- `index.html` — 画面・再生・素材保存・自動照合
- `service-worker.js` — オフライン用アプリ本体キャッシュ
- `manifest.webmanifest` — ホーム画面追加用設定
- `lrc-parser.js` / `tests/lrc-parser.test.js` — LRC解析とテスト

## 開発確認

```powershell
npm test
npm run check
```
