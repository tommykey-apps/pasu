import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	if (!platform) error(500, 'Cloudflare platform binding is not available');

	const row = await platform.env.DB.prepare('SELECT note FROM healthcheck LIMIT 1').first<{
		note: string;
	}>();

	return { d1Note: row?.note ?? null };
};
