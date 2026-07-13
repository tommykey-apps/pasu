# pasu

passkey(WebAuthn)の学習用サンプルアプリ。デモ: https://pasu.tommykey0925.workers.dev

登録もログインも同じ3手順:「① サーバーが challenge を発行 → ② 認証器が challenge に署名 → ③ サーバーが署名を検証」。passkey 固有のコードは実質この6箇所だけ。

## ① サーバーが challenge を発行する

使い捨ての乱数 challenge を作って D1 に保存し、オプションに入れて返す。後で「この署名は今回の挑戦への応答か」を照合するため。

登録 — `src/routes/api/register/options/+server.ts`:

```ts
const options = await generateRegistrationOptions({
	// ライブラリ(乱数 challenge 生成+オプション組み立て)
	rpName,
	rpID,
	userName: name,
	authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
});
await createChallenge(db, { challenge: options.challenge, kind: 'registration' }); // 自前(INSERT)
return json(options);
```

ログイン — `src/routes/api/login/options/+server.ts`:

```ts
// allowCredentials を渡さない = どの passkey を使うかはブラウザ/OS が選ぶ
const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' }); // ライブラリ
await createChallenge(db, { challenge: options.challenge, kind: 'authentication' }); // 自前
```

## ② 認証器が challenge に署名する

やりたいことは「秘密鍵を持つ認証器(Apple Passwords 等)に、challenge への署名を作らせる」。ただしサーバーや Web ページから認証器に直接触る手段はなく、必ずブラウザの API を経由する。ブラウザは Face ID の表示、ドメインに紐づく鍵の隔離、「実際に署名された場所(origin)」の記録までを担う。

`src/routes/+page.svelte`(登録):

```ts
const optionsJSON = await postJson('/api/register/options', { name }); // 自前(fetch ラッパー)
const registration = await startRegistration({ optionsJSON }); // ライブラリ。中身はブラウザ標準 API。ここで鍵ペア作成+署名
result = await postJson('/api/register/verify', registration);
```

ログイン(ユーザー名を送らないことに注目):

```ts
const optionsJSON = await postJson('/api/login/options', {});
const authentication = await startAuthentication({ optionsJSON }); // ライブラリ。passkey 選択+Face ID+署名
await postJson('/api/login/verify', authentication);
```

登録では鍵ペアの新規作成もここで行われ、サーバーに返るのは公開鍵と署名だけ。秘密鍵は端末から出ない。

## ③ サーバーが署名を検証する

challenge を取り出して(=同時に破棄して)署名を検証し、結果を D1 に保存する。

登録 — `src/routes/api/register/verify/+server.ts`。通ったら公開鍵を保存:

```ts
const challenge = await consumeChallenge(db, challengeId, 'registration'); // 自前(DELETE...RETURNING で使い捨て)
const verification = await verifyRegistrationResponse({
	// ライブラリ(署名検証の本丸)
	response: body,
	expectedChallenge: challenge.challenge,
	expectedOrigin: origin,
	expectedRPID: rpID
});
await db.batch([...]); // 自前(users と credentials=公開鍵 を INSERT)
```

ログイン — `src/routes/api/login/verify/+server.ts`。credential ID からユーザーを逆引きし、保存済み公開鍵で検証してセッション発行:

```ts
const row = await db // 自前(credential ID からユーザーを逆引き)
	.prepare('SELECT ... FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.id = ?1')
	.bind(body.id)
	.first();
const verification = await verifyAuthenticationResponse({
	// ライブラリ(署名検証の本丸)
	response: body,
	expectedChallenge: challenge.challenge,
	expectedOrigin: origin,
	expectedRPID: rpID,
	credential: { id: row.id, publicKey, counter: row.counter } // D1 に保存してあった公開鍵
});
const sessionId = await createSession(db, row.user_id); // 自前。ここから先はただの Web アプリ
```

境界線: **「正しいか判定する」= ライブラリ**(バイナリのパースと署名検証。自作すると事故る領域)、**「何を覚えて何を消すか」= 自前**(challenge・公開鍵・counter・セッションの保存と破棄。このリポジトリで読むべき部分)。
