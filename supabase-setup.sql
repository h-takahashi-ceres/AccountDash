-- Supabase の SQL Editor に貼り付けて実行してください。
-- 1つのテーブルに、案件データ全体をJSON(jsonb)としてまるごと保存するシンプルな構成です。

create table if not exists account_board (
  id text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security を有効化
alter table account_board enable row level security;

-- 社内利用の簡易共有として、読み書きを許可するポリシー
-- (URLとanonキーを知っている人は誰でも読み書きできる想定です。
--  ログイン必須にしたくなったら、いつでも認証ベースのポリシーに切り替えられます)
drop policy if exists "authenticated can read" on account_board;
drop policy if exists "authenticated can insert" on account_board;
drop policy if exists "authenticated can update" on account_board;

create policy "allow read for all" on account_board
  for select using (true);

create policy "allow insert for all" on account_board
  for insert with check (true);

create policy "allow update for all" on account_board
  for update using (true);

-- リアルタイム更新(誰かが編集したら他の人にも即反映)を有効化
alter publication supabase_realtime add table account_board;
