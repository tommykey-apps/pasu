import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup } from './cleanup';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY_MS;

async function insertUser(id: string): Promise<void> {
	await env.DB.prepare('INSERT INTO users (id, name, created_at) VALUES (?1, ?2, 0)')
		.bind(id, `name-${id}`)
		.run();
}

async function insertCredential(
	id: string,
	userId: string,
	createdAt: number,
	lastUsedAt: number | null
): Promise<void> {
	await env.DB.prepare(
		"INSERT INTO credentials (id, user_id, public_key, counter, transports, aaguid, created_at, last_used_at) VALUES (?1, ?2, 'pk', 0, '[]', 'aaguid', ?3, ?4)"
	)
		.bind(id, userId, createdAt, lastUsedAt)
		.run();
}

async function userIds(): Promise<string[]> {
	const { results } = await env.DB.prepare('SELECT id FROM users ORDER BY id').all<{
		id: string;
	}>();
	return results.map((row) => row.id);
}

describe('cleanup', () => {
	beforeEach(async () => {
		await env.DB.prepare('DELETE FROM challenges').run();
		await env.DB.prepare('DELETE FROM sessions').run();
		await env.DB.prepare('DELETE FROM credentials').run();
		await env.DB.prepare('DELETE FROM users').run();
	});

	it('90日を超えて使われていないユーザーが credentials / sessions ごと削除されること', async () => {
		await insertUser('stale');
		await insertCredential('cred-stale', 'stale', NOW - 200 * DAY_MS, NOW - 91 * DAY_MS);
		await env.DB.prepare(
			"INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', 'stale', ?1)"
		)
			.bind(NOW + DAY_MS)
			.run();

		const result = await cleanup(env.DB, NOW);

		expect(result.staleUsers).toBe(1);
		expect(await userIds()).toEqual([]);
		const credentials = await env.DB.prepare('SELECT COUNT(*) AS n FROM credentials').first<{
			n: number;
		}>();
		const sessions = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{
			n: number;
		}>();
		expect(credentials?.n).toBe(0);
		expect(sessions?.n).toBe(0);
	});

	it('90日以内に使ったユーザーは残ること', async () => {
		await insertUser('active');
		await insertCredential('cred-active', 'active', NOW - 200 * DAY_MS, NOW - 89 * DAY_MS);

		const result = await cleanup(env.DB, NOW);

		expect(result.staleUsers).toBe(0);
		expect(await userIds()).toEqual(['active']);
	});

	it('未使用でも作成から90日以内のユーザーは残ること', async () => {
		await insertUser('fresh');
		await insertCredential('cred-fresh', 'fresh', NOW - 1 * DAY_MS, null);

		await cleanup(env.DB, NOW);

		expect(await userIds()).toEqual(['fresh']);
	});

	it('期限切れの challenge だけが削除されること', async () => {
		await env.DB.prepare(
			"INSERT INTO challenges (id, challenge, kind, expires_at) VALUES ('expired', 'c', 'registration', ?1), ('alive', 'c', 'registration', ?2)"
		)
			.bind(NOW - 1, NOW + 1)
			.run();

		const result = await cleanup(env.DB, NOW);

		expect(result.expiredChallenges).toBe(1);
		const { results } = await env.DB.prepare('SELECT id FROM challenges').all<{ id: string }>();
		expect(results.map((row) => row.id)).toEqual(['alive']);
	});
});
