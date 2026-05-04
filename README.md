# 勤怠管理システム (Next.js + Supabase + Vercel + Docker)

Supabase を DB に使い、Next.js（フロント/バックエンド一体）で構築した勤怠管理システムのスタータープロジェクトです。  
Vercel へのデプロイを前提にしつつ、ローカル実行は Docker で管理できます。

## クイックスタート（Docker）

```bash
cp .env.example .env.local
# .env.local に Supabase の URL / ANON KEY を設定
docker compose up --build
```

## 1. 初期設定

```bash
cp .env.example .env.local
```

このプロジェクトは **ローカル: Supabaseなし / 本番(Vercel): Supabaseあり** で動かせます。  
ローカルは `USE_SUPABASE=false` のままで利用してください。

```env
USE_SUPABASE=false
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 2. Supabase 側のテーブル作成

`supabase/schema.sql` を Supabase の SQL Editor で実行してください。  
`attendance_records` テーブルと基本的な RLS ポリシーを作成します。

## 3. ローカル実行

### Node.js で実行

```bash
npm install
npm run dev
```

### Docker で実行

```bash
npm run docker:up
```

アクセス先: [http://localhost:3000](http://localhost:3000)

## 4. Vercel デプロイ

1. リポジトリを Vercel に連携
2. Environment Variables に以下を設定
   - `USE_SUPABASE=true`（明示したい場合のみ。未設定でも本番はSupabase利用）
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. デプロイ実行

## 5. Vercelデプロイ前チェック（複数パターン）

Vercelに上げる前に、以下を順番に実施してください。

1. **静的チェック（lint/build）**

```bash
npm run check:predeploy
```

2. **Node.js 実行で確認**

```bash
npm run dev
curl -sS http://localhost:3000/api/health
```

3. **Docker 実行で確認**

```bash
npm run docker:up
curl -sS http://localhost:3000/api/health
```

`/api/health` の見方:
- `status: "ok", mode: "local-mock"`: ローカルモックDBで正常
- `status: "ok"`: Vercelへ進めてOK
- `status: "degraded"`: Supabase環境変数未設定 or 接続エラー

## 6. Next.js バックエンド API

本プロジェクトのバックエンドは **Next.js Route Handler** で実装しています。

- `GET /api/health` : アプリ/DB接続の事前確認
- `GET /api/attendance` : 勤怠一覧取得
- `POST /api/attendance` : 勤怠登録
- `GET /api/attendance/:id` : 勤怠1件取得
- `PATCH /api/attendance/:id` : 勤怠更新
- `DELETE /api/attendance/:id` : 勤怠削除

実装ファイル:
- `src/app/api/health/route.ts`
- `src/app/api/attendance/route.ts`
- `src/app/api/attendance/[id]/route.ts`
- `src/server/attendance-service.ts`
- `src/server/supabase-server.ts`

## 主な構成

- `src/app/page.tsx`  
  勤怠入力フォームと一覧画面
- `src/app/api/attendance/route.ts`  
  勤怠データの取得・登録 API（Next.js Route Handler）
- `supabase/schema.sql`  
  テーブル定義と RLS ポリシー
- `Dockerfile` / `docker-compose.yml`  
  Docker 運用向け設定
