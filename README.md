# pasu

passkey(WebAuthn)の学習用サンプルアプリ。

- SvelteKit (Svelte 5) + `@sveltejs/adapter-cloudflare`
- Cloudflare Workers + D1
- SimpleWebAuthn(登録・認証セレモニーの実装に使用)

## 何をしているか

WebAuthn のセレモニーはどれも「① サーバーが challenge 入りオプションを発行 → ② ブラウザが認証器(Face ID 等)で署名 → ③ サーバーが検証して保存」の2往復。challenge は D1 に保存し、5分期限・一度使ったら破棄(リプレイ防止)。

**登録** — ユーザー名を受け取り challenge を発行(user はまだ作らない)。ブラウザの `startRegistration()` が鍵ペアを生成し、サーバーは公開鍵だけを受け取って検証し、user と credential を保存する。秘密鍵は端末から出ない。`residentKey: 'required'` で discoverable credential を強制しているのが次のユーザー名レスログインの前提。

**ログイン** — ユーザー名の入力なし。`allowCredentials` を空で発行し、どの passkey を使うかはブラウザ/OS が選ぶ。サーバーは飛んできた credential ID から user を逆引きし、保存済み公開鍵で署名を検証。通ったら counter を更新してセッション(D1 + httpOnly cookie、30日スライディング)を発行する。

**追加** — ログイン済みユーザーの2本目以降。初回登録との違いは、user.id が既存ユーザーのものである点と、`excludeCredentials` で登録済み認証器を弾く点だけ。

**削除** — WebAuthn は登場しない。ただし「最後の1本を消すと二度とログインできない」ため、サーバー側でガードする。

**掃除** — 公開デモなので、90日使われていないユーザーと期限切れ challenge を毎日 Cron で削除する(`workers/cleanup`)。公式アダプターは `scheduled` ハンドラを出力できないため、アプリ本体とは別の小さな Worker が同じ D1 に接続している。

### コードの読み順

1. `src/routes/+page.svelte` — セレモニーのブラウザ側(登録・ログイン共通の3ステップ)
2. `src/routes/api/register/{options,verify}/+server.ts` — 登録セレモニー
3. `src/routes/api/login/{options,verify}/+server.ts` — 認証セレモニー
4. `src/lib/server/challenge.ts` — challenge の保存と使い捨て(セレモニー2往復の橋渡し)
5. `src/lib/server/session.ts` + `src/hooks.server.ts` — ログイン後の世界(WebAuthn とは無関係)
6. `src/routes/api/credentials/` + `src/routes/dashboard/` — passkey の追加・削除・一覧
7. `migrations/` — テーブル定義(何を保存するかが一番よく分かる)

## ローカル開発

```bash
pnpm install
pnpm wrangler d1 migrations apply pasu --local   # ローカル D1 にスキーマ適用
pnpm dev
```

ローカルの D1 は `.wrangler/state/` 配下に保存される(Cloudflare へのログイン不要)。

## マイグレーション

スキーマ変更は `migrations/` に SQL ファイルを追加して管理する。

```bash
pnpm wrangler d1 migrations create pasu <name>   # 雛形作成
pnpm wrangler d1 migrations apply pasu --local   # ローカルへ適用
pnpm wrangler d1 migrations apply pasu --remote  # 本番へ適用
```

## デプロイ

本番 D1 の作成は初回のみ:

```bash
pnpm wrangler login
pnpm wrangler d1 create pasu   # 出力された database_id を wrangler.jsonc に反映
```

デプロイはマイグレーション適用 → deploy の順を守る:

```bash
pnpm wrangler d1 migrations apply pasu --remote
pnpm build
pnpm wrangler deploy
```

## テスト

```bash
pnpm test:unit   # Vitest
pnpm test:e2e    # Playwright(Chromium + WebAuthn Virtual Authenticator)
pnpm check       # svelte-check + wrangler types --check
```
