import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, deleteSession, validateSession } from './session';

async function getExpiresAt(id: string): Promise<number | null> {
	const row = await env.DB.prepare('SELECT expires_at FROM sessions WHERE id = ?1')
		.bind(id)
		.first<{ expires_at: number }>();
	return row?.expires_at ?? null;
}

describe('validateSession', () => {
	// isolatedStorage を有効にしていないため、テストをまたいで行が残る前提で冪等に書く
	beforeEach(async () => {
		await env.DB.prepare(
			"INSERT OR IGNORE INTO users (id, name, created_at) VALUES ('user-1', 'taro', 0)"
		).run();
	});

	it('有効なセッションはユーザーを返すこと', async () => {
		const id = await createSession(env.DB, 'user-1');
		expect(await validateSession(env.DB, id)).toEqual({ id: 'user-1', name: 'taro' });
	});

	it('検証のたびに有効期限が延長されること(スライディング)', async () => {
		const id = await createSession(env.DB, 'user-1');
		const soon = Date.now() + 1000;
		await env.DB.prepare('UPDATE sessions SET expires_at = ?2 WHERE id = ?1').bind(id, soon).run();

		expect(await validateSession(env.DB, id)).not.toBeNull();

		const extended = await getExpiresAt(id);
		expect(extended).toBeGreaterThan(soon);
	});

	it('期限切れのセッションは拒否され、行も削除されること', async () => {
		const id = await createSession(env.DB, 'user-1');
		await env.DB.prepare('UPDATE sessions SET expires_at = ?2 WHERE id = ?1')
			.bind(id, Date.now() - 1)
			.run();

		expect(await validateSession(env.DB, id)).toBeNull();
		expect(await getExpiresAt(id)).toBeNull();
	});

	it('削除済みのセッションは検証できないこと', async () => {
		const id = await createSession(env.DB, 'user-1');
		await deleteSession(env.DB, id);
		expect(await validateSession(env.DB, id)).toBeNull();
	});
});
