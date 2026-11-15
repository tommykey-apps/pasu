# 新規登録とログインの実装

## 新規登録

コード例の先頭に import を載せています。`@simplewebauthn/` で始まるものがライブラリ、`$lib/` で始まるものがこのリポジトリのコードです。

### ① サーバーが challenge を発行する

サーバーは毎回新しい challenge を作り、Cloudflare のデータベース D1 に保存してからブラウザに送ります。保存するのは、③で届いた署名が今回の challenge に対するものかを確かめるためです。

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

### ② 認証器が鍵ペアを作って署名する

認証器は、秘密鍵を保管し、本人確認をしてから署名を作る装置やソフトウェアです。Apple Passwords や Google Password Manager、YubiKey のようなセキュリティキーがこれにあたります。つまり認証用の器具です。

秘密鍵は認証器の中にあり、Web ページからは触れません。ページがブラウザに頼むと、ブラウザが Face ID などで本人確認をして認証器に署名させます。ブラウザは署名に「どのサイトで署名したか」(origin) を含めるので、偽サイトで作らせた署名は本物のサイトでは通りません。

新規登録では、認証器がここで鍵ペアを新しく作ります。ブラウザからサーバーに送られるのは公開鍵と署名だけで、秘密鍵は認証器から出ません。

`src/routes/+page.svelte`:

```ts
import { startRegistration } from '@simplewebauthn/browser';
// postJson はこのファイルで定義した関数。JSON を POST して応答を受け取る

const optionsJSON = await postJson('/api/register/options', { name });
const registration = await startRegistration({ optionsJSON });
await postJson('/api/register/verify', registration);
```

`startRegistration` は、ブラウザ標準の `navigator.credentials.create()` を呼び出しやすくした関数です。

### ③ サーバーが署名を検証して公開鍵を保存する

サーバーは D1 から challenge を取り出すと同時に削除します。同じ challenge を二度使わせないためです。そのうえで署名を検証し、成功したらユーザーと公開鍵を D1 に保存します。

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

## ログイン

### ① サーバーが challenge を発行する

新規登録と同じく challenge を作って保存します。ユーザー名は受け取りません。どの passkey を使うかは、ブラウザが利用者に選ばせます。

`src/routes/api/login/options/+server.ts`:

```ts
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { createChallenge } from '$lib/server/challenge';

const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
await createChallenge(db, { challenge: options.challenge, kind: 'authentication' });
```

### ② 認証器が署名する

鍵ペアは作らず、新規登録で作った秘密鍵で署名します。

`src/routes/+page.svelte`:

```ts
import { startAuthentication } from '@simplewebauthn/browser';

const optionsJSON = await postJson('/api/login/options', {});
const authentication = await startAuthentication({ optionsJSON });
await postJson('/api/login/verify', authentication);
```

`startAuthentication` は、ブラウザ標準の `navigator.credentials.get()` を呼び出しやすくした関数です。

### ③ サーバーが署名を検証してセッションを発行する

ブラウザから送られてくる署名には、どの passkey で署名したかを示す credential ID が付いています。サーバーはこの ID を使い、新規登録で保存した公開鍵を D1 から探して署名を検証します。成功したらログイン状態を保つセッションを発行します。そこから先は、パスワードでログインしたあとの Web アプリと同じです。

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

署名の解析と検証は `@simplewebauthn/server` に任せています。このリポジトリで読むべきなのは、challenge・公開鍵・セッションをいつ保存し、いつ消すかの部分です。
