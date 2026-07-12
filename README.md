# pasu

passkey(WebAuthn)の学習用サンプルアプリ。

- SvelteKit (Svelte 5) + `@sveltejs/adapter-cloudflare`
- Cloudflare Workers + D1
- SimpleWebAuthn(登録・認証セレモニーの実装に使用)

## ローカル開発

```bash
npm install
npx wrangler d1 migrations apply pasu --local   # ローカル D1 にスキーマ適用
npm run dev
```

ローカルの D1 は `.wrangler/state/` 配下に保存される(Cloudflare へのログイン不要)。

## マイグレーション

スキーマ変更は `migrations/` に SQL ファイルを追加して管理する。

```bash
npx wrangler d1 migrations create pasu <name>   # 雛形作成
npx wrangler d1 migrations apply pasu --local   # ローカルへ適用
npx wrangler d1 migrations apply pasu --remote  # 本番へ適用
```

## デプロイ

本番 D1 の作成は初回のみ:

```bash
npx wrangler login
npx wrangler d1 create pasu   # 出力された database_id を wrangler.jsonc に反映
```

デプロイはマイグレーション適用 → deploy の順を守る:

```bash
npx wrangler d1 migrations apply pasu --remote
npm run build
npx wrangler deploy
```

## テスト

```bash
npm run test:unit   # Vitest
npm run test:e2e    # Playwright(Chromium + WebAuthn Virtual Authenticator)
npm run check       # svelte-check + wrangler types --check
```
