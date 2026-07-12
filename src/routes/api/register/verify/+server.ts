import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { error, json } from '@sveltejs/kit';
import { consumeChallenge } from '$lib/server/challenge';
import { rpFromUrl } from '$lib/server/rp';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, cookies, platform }) => {
	if (!platform) error(500, 'Cloudflare platform binding is not available');
	const db = platform.env.DB;

	const challengeId = cookies.get('reg_challenge');
	cookies.delete('reg_challenge', { path: '/' });
	if (!challengeId) error(400, 'challenge がありません。最初からやり直してください');

	const challenge = await consumeChallenge(db, challengeId, 'registration');
	if (!challenge || !challenge.user_id || !challenge.user_name) {
		error(400, 'challenge が期限切れか使用済みです。最初からやり直してください');
	}

	const body = (await request.json().catch(() => null)) as RegistrationResponseJSON | null;
	if (!body) error(400, 'リクエスト本文が不正です');

	const { rpID, origin } = rpFromUrl(url);
	const verification = await verifyRegistrationResponse({
		response: body,
		expectedChallenge: challenge.challenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
		// userVerification: 'preferred' で登録させるため、UV フラグは必須にしない
		requireUserVerification: false
	}).catch((e: unknown) => {
		error(400, `検証に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
	});

	if (!verification.verified || !verification.registrationInfo) {
		error(400, '検証に失敗しました');
	}

	const { credential, aaguid } = verification.registrationInfo;
	const now = Date.now();
	// user と credential を同一トランザクションで保存し、user だけの孤児行を作らない
	await db.batch([
		db
			.prepare('INSERT INTO users (id, name, created_at) VALUES (?1, ?2, ?3)')
			.bind(challenge.user_id, challenge.user_name, now),
		db
			.prepare(
				'INSERT INTO credentials (id, user_id, public_key, counter, transports, aaguid, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
			)
			.bind(
				credential.id,
				challenge.user_id,
				isoBase64URL.fromBuffer(credential.publicKey),
				credential.counter,
				JSON.stringify(credential.transports ?? []),
				aaguid,
				now
			)
	]);

	return json({
		user: { id: challenge.user_id, name: challenge.user_name },
		credential: {
			id: credential.id,
			aaguid,
			transports: credential.transports ?? [],
			counter: credential.counter
		}
	});
};
