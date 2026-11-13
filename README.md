# pasu

passkey の仕組みを学ぶためのサンプルアプリです。デモ: https://pasu.tommykey0925.workers.dev

## passkey ってなーにーー？

passkey は公開鍵暗号でログインする仕組みです。登録時に端末で鍵ペアを作り、サーバーには公開鍵だけを渡します。ログイン時は、サーバーが送った乱数 (challenge) に端末が秘密鍵で署名し、サーバーが公開鍵でその署名を確かめます。

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

## パスワード方式との違い

| | パスワード | passkey |
|---|---|---|
| 利用者が覚えるもの | パスワード | なし (端末のロック解除だけ) |
| サーバーに置くもの | パスワードのハッシュ | 公開鍵 |
| サーバーから漏れたら | ハッシュを解読されて成りすましに使われうる | 公開鍵からは署名を作れないので使えない |
| 偽サイトに誘導されたら | 入力したパスワードを盗まれる | 署名が偽サイトの origin に結びつくので、本物のサイトでは通らない |
| 使い回し | 他サイトの漏洩が波及する | サイトごとに別の鍵ペアを作る |

## 新規登録

コード例の先頭に import を載せています。`@simplewebauthn/` で始まるものがライブラリ、`$lib/` で始まるものがこのリポジトリのコードです。

### ① サーバーが challenge を発行する

サーバーは毎回新しい challenge を作り、D1 に保存してから返します。保存するのは、③で届いた署名が今回の challenge に対するものかを確かめるためです。

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

新規登録では、認証器がここで鍵ペアを新しく作ります。サーバーに返るのは公開鍵と署名だけです。

`src/routes/+page.svelte`:

```ts
import { startRegistration } from '@simplewebauthn/browser';
// postJson は同じファイル内で定義した fetch の包み

const optionsJSON = await postJson('/api/register/options', { name });
const registration = await startRegistration({ optionsJSON });
await postJson('/api/register/verify', registration);
```

`startRegistration` は、ブラウザ標準の `navigator.credentials.create()` を呼ぶ薄い包みです。

### ③ サーバーが署名を検証して公開鍵を保存する

サーバーは D1 から challenge を取り出すと同時に削除します。同じ challenge を二度使わせないためです。そのうえで署名を検証し、通ったらユーザーと公開鍵を保存します。

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

`startAuthentication` は、ブラウザ標準の `navigator.credentials.get()` を呼ぶ薄い包みです。

### ③ サーバーが署名を検証してセッションを発行する

届いた credential ID から保存済みの公開鍵を探し、その公開鍵で署名を検証します。通ればセッションを発行し、そこから先は普通の Cookie ログインと変わりません。

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
