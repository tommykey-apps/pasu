# pasu

passkey(WebAuthn)の学習用サンプルアプリ。デモ: https://pasu.tommykey0925.workers.dev

登録もログインも同じ3手順:「① ブラウザが仲介 → ② サーバーが challenge 発行 → ③ サーバーが検証」。passkey 固有のコードは実質この6箇所だけ。

## ① ブラウザが仲介する

`src/routes/+page.svelte`。options をもらい、ブラウザ API(Face ID 等が出る)を呼び、結果を verify に送る。

登録:

```ts
const optionsJSON = await postJson('/api/register/options', { name }); // 自前(fetch ラッパー)
const registration = await startRegistration({ optionsJSON }); // ライブラリ。Face ID はブラウザ/OS が出す
result = await postJson('/api/register/verify', registration);
```

ログイン(ユーザー名を送らないことに注目):

```ts
const optionsJSON = await postJson('/api/login/options', {});
const authentication = await startAuthentication({ optionsJSON }); // ライブラリ。passkey 選択+Face ID
await postJson('/api/login/verify', authentication);
```

## ② サーバーが challenge を発行する

使い捨ての乱数 challenge を作って D1 に保存し、オプションに入れて返す。

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

## ③ サーバーが検証する

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

## 関数の出どころ一覧

| 関数                                                            | 出どころ                                             | 中でやっていること                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `startRegistration` / `startAuthentication`                     | ライブラリ(@simplewebauthn/browser)                  | ブラウザ標準 API `navigator.credentials.create()/get()` の薄いラッパー(JSON⇔バイナリ変換だけ) |
| `generateRegistrationOptions` / `generateAuthenticationOptions` | ライブラリ(@simplewebauthn/server)                   | 乱数 challenge の生成と、仕様どおりのオプション組み立て                                       |
| `verifyRegistrationResponse` / `verifyAuthenticationResponse`   | ライブラリ(@simplewebauthn/server)                   | 本丸。challenge/origin/RP ID の照合 → counter 検査 → 保存済み公開鍵での署名検証(WebCrypto)    |
| `postJson`                                                      | 自前                                                 | ただの fetch ラッパー                                                                         |
| `createChallenge` / `consumeChallenge`                          | 自前(`src/lib/server/challenge.ts`)                  | challenge の INSERT と、取り出し=破棄(`DELETE ... RETURNING`)                                 |
| `createSession` / `validateSession`                             | 自前(`src/lib/server/session.ts`)                    | セッション ID 発行、cookie 照合、30日スライディング延長                                       |
| `deleteCredential` / `cleanup`                                  | 自前(`src/lib/server/credentials.ts` / `cleanup.ts`) | 最後の1本の削除ガード、90日未使用データの Cron 掃除                                           |

境界線: **「正しいか判定する」= ライブラリ**(バイナリのパースと署名検証。自作すると事故る領域)、**「何を覚えて何を消すか」= 自前**(challenge・公開鍵・counter・セッションの保存と破棄。このリポジトリで読むべき部分)。
