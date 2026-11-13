# pasu

passkey の仕組みを学ぶためのサンプルアプリです。デモ: https://pasu.tommykey0925.workers.dev

## 仕組み

passkey は公開鍵暗号でログインする仕組みです。登録時に端末で鍵ペアを作り、サーバーには公開鍵だけを渡します。ログイン時は、サーバーが送った乱数 (challenge) に端末が秘密鍵で署名し、サーバーが公開鍵でその署名を確かめます。サーバーに置くのは公開鍵だけなので、漏れても成りすましには使えません。

```
サーバー                    ブラウザ                  認証器 (端末)
  │                           │                          │
  │ ① challenge を発行 ──────▶│                          │
  │                           │ ② 署名を依頼 ───────────▶│ Face ID などで本人確認
  │                           │◀─────────────────── 署名 │
  │◀──────────── 署名を送る   │                          │
  │ ③ 署名を検証              │                          │
```

登録もログインもこの3手順で進みます。登録では②で鍵ペアを新しく作り、③で公開鍵を保存します。ログインでは保存済みの公開鍵で③の検証をします。

## ① challenge を発行する

サーバーは毎回新しい challenge を作り、D1 に保存してから返します。保存するのは、③で届いた署名が今回の challenge に対するものかを確かめるためです。

`src/routes/api/register/options/+server.ts`:

```ts
const options = await generateRegistrationOptions({
	rpName,
	rpID,
	userName: name,
	authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
});
await createChallenge(db, { challenge: options.challenge, kind: 'registration' });
return json(options);
```

ログイン側 (`src/routes/api/login/options/+server.ts`) はユーザー名を受け取りません。どの passkey を使うかは、ブラウザが利用者に選ばせます。

```ts
const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
await createChallenge(db, { challenge: options.challenge, kind: 'authentication' });
```

## ② 認証器が署名する

秘密鍵は認証器 (Apple Passwords や Google Password Manager など) の中にあり、Web ページからは触れません。ページがブラウザに頼むと、ブラウザが Face ID などで本人確認をして認証器に署名させます。ブラウザは署名に「どのサイトで署名したか」(origin) を含めるので、偽サイトで作らせた署名は本物のサイトでは通りません。

`src/routes/+page.svelte`:

```ts
// 登録: ここで鍵ペアが作られ、公開鍵と署名だけが返る
const optionsJSON = await postJson('/api/register/options', { name });
const registration = await startRegistration({ optionsJSON });
await postJson('/api/register/verify', registration);

// ログイン
const optionsJSON = await postJson('/api/login/options', {});
const authentication = await startAuthentication({ optionsJSON });
await postJson('/api/login/verify', authentication);
```

`startRegistration` と `startAuthentication` は、ブラウザ標準の `navigator.credentials` を呼ぶ薄い包みです。

## ③ 署名を検証する

サーバーは D1 から challenge を取り出すと同時に削除します。同じ challenge を二度使わせないためです。そのうえで署名を検証します。

登録 (`src/routes/api/register/verify/+server.ts`) は、検証が通ったらユーザーと公開鍵を保存します。

```ts
const challenge = await consumeChallenge(db, challengeId, 'registration');
const verification = await verifyRegistrationResponse({
	response: body,
	expectedChallenge: challenge.challenge,
	expectedOrigin: origin,
	expectedRPID: rpID
});
await db.batch([/* users と credentials に INSERT */]);
```

ログイン (`src/routes/api/login/verify/+server.ts`) は、届いた credential ID から保存済みの公開鍵を探して検証します。通ればセッションを発行し、そこから先は普通の Cookie ログインと変わりません。

```ts
const row = await db
	.prepare('SELECT ... FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.id = ?1')
	.bind(body.id)
	.first();
const verification = await verifyAuthenticationResponse({
	response: body,
	expectedChallenge: challenge.challenge,
	expectedOrigin: origin,
	expectedRPID: rpID,
	credential: { id: row.id, publicKey, counter: row.counter }
});
const sessionId = await createSession(db, row.user_id);
```

署名の解析と検証は `@simplewebauthn/server` に任せています。このリポジトリで読むべきなのは、challenge・公開鍵・セッションをいつ保存し、いつ消すかの部分です。
