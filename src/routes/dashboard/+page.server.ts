import { error, redirect } from '@sveltejs/kit';
import { deleteSession, SESSION_COOKIE } from '$lib/server/session';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/');
	return { user: locals.user };
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
