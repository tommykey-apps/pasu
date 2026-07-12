import { error, fail, redirect } from '@sveltejs/kit';
import { authenticatorName } from '$lib/server/aaguid';
import { deleteCredential } from '$lib/server/credentials';
import { deleteSession, SESSION_COOKIE } from '$lib/server/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.user) redirect(303, '/');
	if (!platform) error(500, 'Cloudflare platform binding is not available');

	const { results } = await platform.env.DB.prepare(
		'SELECT id, aaguid, created_at, last_used_at FROM credentials WHERE user_id = ?1 ORDER BY created_at'
	)
		.bind(locals.user.id)
		.all<{ id: string; aaguid: string; created_at: number; last_used_at: number | null }>();

	return {
		user: locals.user,
		credentials: results.map((row) => ({
			id: row.id,
			authenticator: authenticatorName(row.aaguid),
			createdAt: row.created_at,
			lastUsedAt: row.last_used_at
		}))
	};
};

export const actions: Actions = {
	delete: async ({ request, locals, platform }) => {
		if (!locals.user) redirect(303, '/');
		if (!platform) error(500, 'Cloudflare platform binding is not available');

		const form = await request.formData();
		const credentialId = form.get('credentialId');
		if (typeof credentialId !== 'string' || credentialId === '') {
			return fail(400, { message: '削除対象が指定されていません' });
		}

		const result = await deleteCredential(platform.env.DB, locals.user.id, credentialId);
		if (result === 'not_found') {
			return fail(400, { message: 'この passkey は存在しないか、あなたのものではありません' });
		}
		if (result === 'last_credential') {
			return fail(400, {
				message: '最後の1本は削除できません。消すと二度とログインできなくなります'
			});
		}
		return {
			message:
				'サーバーから削除しました。端末のパスワードマネージャーには残っているので、不要ならそちらからも削除してください'
		};
	},

	logout: async ({ cookies, platform }) => {
		if (!platform) error(500, 'Cloudflare platform binding is not available');

		const sessionId = cookies.get(SESSION_COOKIE);
		if (sessionId) {
			await deleteSession(platform.env.DB, sessionId);
			cookies.delete(SESSION_COOKIE, { path: '/' });
		}
		redirect(303, '/');
	}
};
