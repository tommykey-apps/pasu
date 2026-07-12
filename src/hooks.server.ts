import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, validateSession } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const sessionId = event.cookies.get(SESSION_COOKIE);
	if (sessionId && event.platform) {
		const user = await validateSession(event.platform.env.DB, sessionId);
		if (user) {
			event.locals.user = user;
			// DB 側のスライディング延長に cookie の寿命も合わせる
			event.cookies.set(SESSION_COOKIE, sessionId, {
				path: '/',
				maxAge: SESSION_MAX_AGE_SECONDS
			});
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	return resolve(event);
};
