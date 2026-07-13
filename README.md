# pasu

passkey(WebAuthn)の学習用サンプルアプリ。

- SvelteKit (Svelte 5) + `@sveltejs/adapter-cloudflare`
- Cloudflare Workers + D1
- SimpleWebAuthn(登録・認証セレモニーの実装に使用)

## 用語の予習

パスワードは「あなたとサーバーが同じ秘密を共有する」仕組みで、サーバーが漏れると秘密ごと漏れる。**WebAuthn** はこれをやめて「秘密鍵で署名し、公開鍵で検証する」仕組みに変えた W3C 標準。秘密鍵は端末から出ないので、サーバーが漏れても盗むものがない。

- **passkey(パスキー)** — WebAuthn の credential に「デバイス間で同期できる」などの使い勝手を足した呼び名。技術的な中身は WebAuthn
- **セレモニー(ceremony)** — WebAuthn 仕様の用語で、単に「決まった手順の一連のやりとり」のこと。**登録**(鍵ペアを作って公開鍵をサーバーに預ける)と**認証**(challenge に署名してログインする)の2種類しかなく、どちらも「① サーバーがオプション発行 → ② ブラウザが認証器で署名 → ③ サーバーが検証」の2往復
- **認証器(authenticator)** — 秘密鍵を保管して署名する主体。iCloud キーチェーン、Google パスワードマネージャー、YubiKey などの物理キーもこれ
- **challenge** — サーバーが毎回発行する使い捨ての乱数。これに署名させることで、通信を盗み見た攻撃者が同じ署名を再送しても無効になる(リプレイ防止)
- **credential** — 登録で作られる鍵ペアとその付随情報。**credential ID** は認証器が発行する識別子で、サーバーはこれでユーザーを逆引きできる
- **RP(Relying Party)** — 認証を「頼る側」、つまりこのアプリのこと。**RP ID** はそのドメイン名で、署名に焼き込まれるため偽サイトでは署名が成立しない(フィッシング耐性)
- **counter** — 署名のたびに増える数。増えない・戻る場合は認証器の複製を疑うシグナル
- **AAGUID** — 認証器の機種を表す ID。「Apple Passwords」のような表示名の解決に使う
- **discoverable credential** — 認証器側が「このサイトの鍵はこれ」と自力で見つけられる形式の credential。サーバーにユーザー名を先に伝えなくてよくなり、ユーザー名レスログインが可能になる

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
pnpm check       # wrangler types(型の再生成)+ svelte-check
```
