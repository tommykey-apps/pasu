// 【読み方】passkey 追加セレモニーの後半。register/verify と同じ検証をするが、
// user は既に存在するので credential の INSERT だけを行う

import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { error, json } from '@sveltejs/kit';
import { consumeChallenge } from '$lib/server/challenge';
import { rpFromUrl } from '$lib/server/rp';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, cookies, locals, platform }) => {
	if (!locals.user) error(401, 'ログインが必要です');
	if (!platform) error(500, 'Cloudflare platform binding is not available');
	const db = platform.env.DB;

	const challengeId = cookies.get('add_challenge');
	cookies.delete('add_challenge', { path: '/' });
	if (!challengeId) error(400, 'challenge がありません。最初からやり直してください');

	const challenge = await consumeChallenge(db, challengeId, 'registration');
	// challenge の発行時ユーザーとセッションユーザーの一致まで確認し、
	// 他人のセッションで拾った challenge を流用できないようにする
	if (!challenge || challenge.user_id !== locals.user.id) {
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
		requireUserVerification: false
	}).catch((e: unknown) => {
		error(400, `検証に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
	});

	if (!verification.verified || !verification.registrationInfo) {
		error(400, '検証に失敗しました');
	}

	const { credential, aaguid } = verification.registrationInfo;
	await db
		.prepare(
			'INSERT INTO credentials (id, user_id, public_key, counter, transports, aaguid, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
		)
		.bind(
			credential.id,
			locals.user.id,
			isoBase64URL.fromBuffer(credential.publicKey),
			credential.counter,
			JSON.stringify(credential.transports ?? []),
			aaguid,
			Date.now()
		)
		.run();

	return json({ credential: { id: credential.id, aaguid } });
};
