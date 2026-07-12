import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type {
	AuthenticationResponseJSON,
	AuthenticatorTransportFuture
} from '@simplewebauthn/server';
import { error, json } from '@sveltejs/kit';
import { consumeChallenge } from '$lib/server/challenge';
import { rpFromUrl } from '$lib/server/rp';
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '$lib/server/session';
import type { RequestHandler } from './$types';

interface CredentialRow {
	id: string;
	user_id: string;
	public_key: string;
	counter: number;
	transports: string;
	name: string;
}

export const POST: RequestHandler = async ({ request, url, cookies, platform }) => {
	if (!platform) error(500, 'Cloudflare platform binding is not available');
	const db = platform.env.DB;

	const challengeId = cookies.get('auth_challenge');
	cookies.delete('auth_challenge', { path: '/' });
	if (!challengeId) error(400, 'challenge がありません。最初からやり直してください');

	const challenge = await consumeChallenge(db, challengeId, 'authentication');
	if (!challenge) error(400, 'challenge が期限切れか使用済みです。最初からやり直してください');

	const body = (await request.json().catch(() => null)) as AuthenticationResponseJSON | null;
	if (!body?.id) error(400, 'リクエスト本文が不正です');

	// ユーザー名レスなので、飛んできた credential ID から所有ユーザーを逆引きする
	const row = await db
		.prepare(
			'SELECT c.id, c.user_id, c.public_key, c.counter, c.transports, u.name FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.id = ?1'
		)
		.bind(body.id)
		.first<CredentialRow>();
	if (!row) error(400, 'この passkey は登録されていません');

	const { rpID, origin } = rpFromUrl(url);
	const verification = await verifyAuthenticationResponse({
		response: body,
		expectedChallenge: challenge.challenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
		credential: {
			id: row.id,
			publicKey: isoBase64URL.toBuffer(row.public_key),
			counter: row.counter,
			transports: JSON.parse(row.transports) as AuthenticatorTransportFuture[]
		},
		// userVerification: 'preferred' で発行しているため、UV フラグは必須にしない
		requireUserVerification: false
	}).catch((e: unknown) => {
		error(400, `検証に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
	});

	if (!verification.verified) error(400, '検証に失敗しました');

	await db
		.prepare('UPDATE credentials SET counter = ?2, last_used_at = ?3 WHERE id = ?1')
		.bind(row.id, verification.authenticationInfo.newCounter, Date.now())
		.run();

	const sessionId = await createSession(db, row.user_id);
	cookies.set(SESSION_COOKIE, sessionId, { path: '/', maxAge: SESSION_MAX_AGE_SECONDS });

	return json({ user: { id: row.user_id, name: row.name } });
};
