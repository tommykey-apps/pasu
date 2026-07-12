import { generateRegistrationOptions } from '@simplewebauthn/server';
import { error, json } from '@sveltejs/kit';
import { createChallenge } from '$lib/server/challenge';
import { rpFromUrl, rpName } from '$lib/server/rp';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, cookies, platform }) => {
	if (!platform) error(500, 'Cloudflare platform binding is not available');

	const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (name.length < 1 || name.length > 64) {
		error(400, 'ユーザー名は1〜64文字で入力してください');
	}

	const { rpID } = rpFromUrl(url);
	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userName: name,
		attestationType: 'none',
		authenticatorSelection: {
			// ユーザー名レスログインの前提となる discoverable credential を強制する
			residentKey: 'required',
			userVerification: 'preferred'
		}
	});

	const challengeId = await createChallenge(platform.env.DB, {
		challenge: options.challenge,
		kind: 'registration',
		userId: options.user.id,
		userName: name
	});
	cookies.set('reg_challenge', challengeId, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		maxAge: 300
	});

	return json(options);
};
