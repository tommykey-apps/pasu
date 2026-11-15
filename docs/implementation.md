# 新規登録とログインの実装

README の「ユーザ新規登録時」「ログイン時」の手順ごとに、対応するコードを載せています。

コード例の先頭に import を載せています。`@simplewebauthn/` で始まるものがライブラリ、`$lib/` で始まるものがこのリポジトリのコードです。

## ユーザ新規登録時

### 1. PC, スマホ本体で公開鍵と秘密鍵のペアを作る

README では省いていますが、新規登録でもサーバが先に一時的な乱数 (challenge) を作ってブラウザに渡します。サーバはこの乱数を Cloudflare のデータベース D1 に保存しておき、2. で届いた公開鍵が今回の登録で作られたものかを確かめます。

`src/routes/api/register/options/+server.ts`:

```ts
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { json } from '@sveltejs/kit';
import { createChallenge } from '$lib/server/challenge';

const options = await generateRegistrationOptions({
	rpName,
	rpID,
	userName: name,
	authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
});
await createChallenge(db, { challenge: options.challenge, kind: 'registration' });
return json(options);
```

ブラウザは JS で PC, スマホ本体の機能を呼び出し、鍵ペアを作らせます。この機能を持つものを認証器と呼びます。Apple Passwords や Google Password Manager、YubiKey のようなセキュリティキーがこれにあたります。

秘密鍵は認証器の中にあり、Web ページからは触れません。PC, スマホ本体は Face ID などで本人確認をしてから鍵ペアを作り、公開鍵に署名を付けて返します。署名には「どのサイトで作ったか」(origin) が含まれるので、偽サイトで作らせたものは本物のサイトでは通りません。

`src/routes/+page.svelte`:

```ts
import { startRegistration } from '@simplewebauthn/browser';
// postJson はこのファイルで定義した関数。JSON を POST して応答を受け取る

const optionsJSON = await postJson('/api/register/options', { name });
const registration = await startRegistration({ optionsJSON });
await postJson('/api/register/verify', registration);
```

`startRegistration` は、ブラウザ標準の `navigator.credentials.create()` を呼び出しやすくした関数です。

### 2. 公開鍵をサーバに渡して保存する

サーバは D1 から乱数を取り出すと同時に削除します。同じ乱数を二度使わせないためです。そのうえで署名を検証し、成功したらユーザと公開鍵を紐付けて D1 に保存します。秘密鍵はサーバに渡りません。

`src/routes/api/register/verify/+server.ts`:

```ts
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { consumeChallenge } from '$lib/server/challenge';

const challenge = await consumeChallenge(db, challengeId, 'registration');
const verification = await verifyRegistrationResponse({
	response: body,
	expectedChallenge: challenge.challenge,
	expectedOrigin: origin,
	expectedRPID: rpID
});
await db.batch([/* users と credentials に INSERT */]);
```

## ログイン時

### 1. サーバが一時的な乱数を生成してブラウザに渡す

サーバは乱数 (challenge) を作り、D1 に保存してからブラウザに渡します。ユーザ名は受け取りません。どの passkey を使うかは、ブラウザが利用者に選ばせます。

`src/routes/api/login/options/+server.ts`:

```ts
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { createChallenge } from '$lib/server/challenge';

const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
await createChallenge(db, { challenge: options.challenge, kind: 'authentication' });
```

### 2. PC, スマホ本体にその乱数と秘密鍵で署名を作らせる

鍵ペアは作らず、新規登録で作った秘密鍵で署名します。

`src/routes/+page.svelte`:

```ts
import { startAuthentication } from '@simplewebauthn/browser';

const optionsJSON = await postJson('/api/login/options', {});
const authentication = await startAuthentication({ optionsJSON });
await postJson('/api/login/verify', authentication);
```

`startAuthentication` は、ブラウザ標準の `navigator.credentials.get()` を呼び出しやすくした関数です。

### 3. サーバが公開鍵で署名を検証する

ブラウザから送られてくる署名には、どの passkey で署名したかを示す credential ID が付いています。サーバはこの ID で、新規登録で保存した公開鍵を D1 から探して署名を検証します。乱数は新規登録と同じく、取り出すと同時に削除します。

成功したらログイン状態を保つセッションを発行します。そこから先は、パスワードでログインしたあとの Web アプリと同じです。

`src/routes/api/login/verify/+server.ts`:

```ts
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { consumeChallenge } from '$lib/server/challenge';
import { createSession } from '$lib/server/session';

const challenge = await consumeChallenge(db, challengeId, 'authentication');
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

署名の解析と検証は `@simplewebauthn/server` に任せています。このリポジトリで読むべきなのは、乱数・公開鍵・セッションをいつ保存し、いつ消すかの部分です。
