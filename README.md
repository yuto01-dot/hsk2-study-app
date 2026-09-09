# HSK2 集中学習アプリ

HSK2級対策のフラッシュカード＆クイズアプリ（PWA対応・静的サイト）。

## ローカルで確認する

```bash
npx serve .
```

## 公開する（GitHub Pages・無料）

1. https://github.com/new でリポジトリを新規作成する（例: `hsk2-study-app`）。README等は追加しない。
2. このフォルダで以下を実行してプッシュする。

```bash
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git branch -M main
git add .
git commit -m "Initial commit"
git push -u origin main
```

3. GitHubのリポジトリ画面で Settings → Pages を開き、Source を「Deploy from a branch」、Branch を `main` / `/(root)` に設定して Save。
4. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` でアクセス可能になる。

## iPhoneでアプリのように使う

1. Safari または Chrome で上記URLを開く。
2. Safari: 共有ボタン → 「ホーム画面に追加」。
   Chrome: メニュー(⋮) → 「ホーム画面に追加」。
3. ホーム画面のアイコンから起動するとアドレスバーなしの全画面アプリとして動作する。

## 進捗の保存について

進捗（覚えた単語・XP・連続学習日数）はブラウザの `localStorage` に保存される。
同じブラウザ・同じ端末で開く限り保持される。機種変更やブラウザを変える場合は、
アプリ内の「進捗コード」機能でコードをコピーし、新しい端末の「コードから復元」に貼り付けること。
