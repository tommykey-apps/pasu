import { generateRegistrationOptions } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { error, json } from '@sveltejs/kit';
import { createChallenge } from '$lib/server/challenge';
import { rpFromUrl, rpName } from '$lib/server/rp';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ url, cookies, locals, platform }) => {
	if (!locals.user) error(401, 'ログインが必要です');
	if (!platform) error(500, 'Cloudflare platform binding is not available');
	const db = platform.env.DB;

	const { results: existing } = await db
		.prepare('SELECT id, transports FROM credentials WHERE user_id = ?1')
		.bind(locals.user.id)
		.all<{ id: string; transports: string }>();

	const { rpID } = rpFromUrl(url);
	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userName: locals.user.name,
		// 初回登録と違い user.id は既存ユーザーのものを使う。
		// 同じ認証器への重複登録は excludeCredentials でブラウザ側に拒否させる
		userID: isoBase64URL.toBuffer(locals.user.id),
		attestationType: 'none',
		authenticatorSelection: {
			residentKey: 'required',
			userVerification: 'preferred'
		},
		excludeCredentials: existing.map((row) => ({
			id: row.id,
			transports: JSON.parse(row.transports) as AuthenticatorTransportFuture[]
		}))
	});

	const challengeId = await createChallenge(db, {
		challenge: options.challenge,
		kind: 'registration',
		userId: locals.user.id,
		userName: locals.user.name
	});
	cookies.set('add_challenge', challengeId, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		maxAge: 300
	});

	return json(options);
};
