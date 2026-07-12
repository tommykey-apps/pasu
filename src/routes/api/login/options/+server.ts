import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { error, json } from '@sveltejs/kit';
import { createChallenge } from '$lib/server/challenge';
import { rpFromUrl } from '$lib/server/rp';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ url, cookies, platform }) => {
	if (!platform) error(500, 'Cloudflare platform binding is not available');

	const { rpID } = rpFromUrl(url);
	// allowCredentials を渡さないことで、どの passkey を使うかの選択を
	// ブラウザ/OS に委ねる(discoverable credential 前提のユーザー名レスログイン)
	const options = await generateAuthenticationOptions({
		rpID,
		userVerification: 'preferred'
	});

	const challengeId = await createChallenge(platform.env.DB, {
		challenge: options.challenge,
		kind: 'authentication'
	});
	cookies.set('auth_challenge', challengeId, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		maxAge: 300
	});

	return json(options);
};
