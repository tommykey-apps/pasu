import { error, redirect } from '@sveltejs/kit';
import { authenticatorName } from '$lib/server/aaguid';
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
