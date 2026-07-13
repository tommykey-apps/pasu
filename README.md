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

### コードの読み順と実装の要点

以下の抜粋は実コードから要点だけを残したもの。全体は各ファイルを参照。

**1. `src/routes/+page.svelte` — セレモニーのブラウザ側**

登録もログインも「options 取得 → ブラウザ API(OS の生体認証ダイアログが出る)→ verify に送る」の3行が本体:

```ts
const optionsJSON = await postJson('/api/register/options', { name });
const registration = await startRegistration({ optionsJSON }); // Face ID 等が出る
result = await postJson('/api/register/verify', registration);
```

**2. `src/routes/api/register/{options,verify}/+server.ts` — 登録セレモニー**

options 側。ライブラリ(SimpleWebAuthn)がオプション組み立てを担い、アプリは challenge の保存だけ自前で行う:

```ts
const options = await generateRegistrationOptions({
	rpName,
	rpID, // ドメイン名。署名に焼き込まれる
	userName: name,
	authenticatorSelection: {
		residentKey: 'required', // discoverable credential を強制(ユーザー名レスログインの前提)
		userVerification: 'preferred'
	}
});
const challengeId = await createChallenge(db, { challenge: options.challenge, ... });
cookies.set('reg_challenge', challengeId, { httpOnly: true, maxAge: 300 });
```

verify 側。challenge を取り出して(=同時に破棄して)検証し、通ったら保存:

```ts
const challenge = await consumeChallenge(db, challengeId, 'registration');
const verification = await verifyRegistrationResponse({
	response: body, // ブラウザから来た署名済みレスポンス
	expectedChallenge: challenge.challenge,
	expectedOrigin: origin,
	expectedRPID: rpID
});
const { credential, aaguid } = verification.registrationInfo;
await db.batch([
	/* INSERT users */
	/* INSERT credentials(公開鍵・counter・transports・AAGUID) */
]);
```

**3. `src/routes/api/login/{options,verify}/+server.ts` — 認証セレモニー**

options 側の肝は「何も指定しない」こと。`allowCredentials` を渡さないので、どの passkey を使うかはブラウザ/OS が選ぶ:

```ts
const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
```

verify 側。飛んできた credential ID からユーザーを逆引きし、保存済み公開鍵で署名を検証する:

```ts
const row = await db
	.prepare('SELECT ... FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.id = ?1')
	.bind(body.id) // credential ID
	.first();
const verification = await verifyAuthenticationResponse({
	response: body,
	expectedChallenge: challenge.challenge,
	expectedOrigin: origin,
	expectedRPID: rpID,
	credential: { id: row.id, publicKey: ..., counter: row.counter }
});
// counter を更新し、セッションを発行(ここで WebAuthn は終わり)
```

**4. `src/lib/server/challenge.ts` — challenge の使い捨て**

取り出しと削除を SQL 1文で行うのがポイント。検証が失敗しても challenge は消えているので再利用できない:

```ts
const row = await db
	.prepare('DELETE FROM challenges WHERE id = ?1 AND kind = ?2 RETURNING *')
	.bind(id, kind)
	.first();
if (!row || row.expires_at <= Date.now()) return null;
```

**5. `src/lib/server/session.ts` + `src/hooks.server.ts` — ログイン後の世界**

WebAuthn とは無関係な自前セッション。全リクエストの入口(hooks)で cookie を検証して `locals.user` に載せるだけ:

```ts
const user = await validateSession(event.platform.env.DB, sessionId);
if (user) event.locals.user = user;
```

**6. `src/routes/api/credentials/` + `src/routes/dashboard/` — 追加・削除・一覧**

追加は登録セレモニーの変形で、差分は2点だけ。既存ユーザーの id を使うことと、登録済み認証器を弾くこと:

```ts
userID: isoBase64URL.toBuffer(locals.user.id),
excludeCredentials: existing.map((row) => ({ id: row.id, transports: ... }))
```

削除のガードはサーバー側が本体(UI の無効化は補助)。「最後の1本を消すと二度とログインできない」ため:

```ts
if (!owned) return 'not_found';
if ((target?.total ?? 0) <= 1) return 'last_credential';
```

**7. `migrations/` — テーブル定義**

何を保存するか(=何を保存しなくてよいか)が一番よく分かる。`credentials` にあるのは公開鍵とメタデータだけで、パスワードのハッシュのような「漏れたら困る秘密」がどこにもないことに注目。

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
