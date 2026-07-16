# Account Dash

案件・チャネル・課題/打ち手/TODOを俯瞰するための社内向けダッシュボードです。
GitHub + Vercel でデプロイし、Supabase をデータの保存先(チーム共有)として使います。

## 使い方の概要

- 初回アクセス時にお名前を登録します(「参加する」画面)。登録した名前は担当者のプルダウンに表示されます
- 案件を開くと「チャネル状況」「TODO」の2タブ構成
  - チャネル状況: 各チャネルの担当者・課題・打ち手・その他TODOをすべて表示(省略なし)
  - TODO: Asanaのリスト表示を踏襲。担当者・優先度・期限を設定でき、タスクの中にサブタスクも作れます
- サイドバー下部の「招待リンクをコピー」で、サイトのURLをコピーしてチームに共有できます。
  Supabaseで同じチームルームに接続している人は誰でも同じデータを見られます
- 案件を開いた状態で「このページのリンクをコピー」を押すと、その案件を直接開くリンクをコピーできます
  (アドレスバーにも `?project=案件ID` が自動で反映されます)

## 構成

- フロントエンド: React + Vite(単一ページアプリ)
- ホスティング: Vercel(GitHub連携で自動デプロイ)
- データ保存: Supabase(Postgres + リアルタイム更新)
- Supabase未設定の場合は、自動的にこのブラウザの localStorage に保存されます(個人利用モード)
- ログイン(認証)は不要ですが、使い始める前に名前の登録が必要です

## セットアップ手順

### 1. Supabase プロジェクトを作成

1. https://supabase.com にアクセスし、無料でプロジェクトを作成
2. 左メニュー「SQL Editor」を開き、このリポジトリの `supabase-setup.sql` の中身を貼り付けて実行
   - これで `account_board` テーブルが作成され、リアルタイム更新も有効になります
3. 左メニュー「Project Settings → API」を開き、以下の2つをメモ
   - `Project URL`
   - `anon public` キー

### 2. ローカルで動作確認(任意)

```bash
npm install
cp .env.example .env
# .env を開いて、上でメモした値を貼り付ける
npm run dev
```

`http://localhost:5173` で開いて、サイドバーに「🌐 チーム共有中(Supabase)」と出ていれば成功です。

### 3. GitHubにpush

```bash
git init
git add .
git commit -m "Account Dash 初回コミット"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repo>.git
git push -u origin main
```

### 4. Vercelでデプロイ

1. https://vercel.com にログイン(GitHubアカウントでOK)
2. 「Add New... → Project」から、pushしたGitHubリポジトリを選択
3. Framework Preset は「Vite」が自動検出されるはずです(そのままでOK)
4. 「Environment Variables」に以下を追加:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_TEAM_ROOM_ID`(任意。省略時は `default-team`)
5. 「Deploy」をクリック

数十秒でデプロイが完了し、`https://<プロジェクト名>.vercel.app` のようなURLが発行されます。
このURLをチームに共有すれば、全員が同じデータをリアルタイムに見られます。

以降、`main` ブランチに push するたびに Vercel が自動で再デプロイします。

## セキュリティについて(正直な注意点)

`supabase-setup.sql` のポリシーは「URLとanonキーを知っていれば誰でも読み書きできる」簡易的な設定です。
社内の閉じた利用であれば通常は問題ありませんが、もし後からログイン必須にしたくなったら
Supabase Authenticationを使った認証ベースのポリシーにいつでも切り替えられます。

## チーム共有せず個人利用したい場合

`.env` を作らない(または空のまま)であれば、Supabaseに接続せず、これまで通り
このブラウザだけにデータが保存されるモードで動作します。
