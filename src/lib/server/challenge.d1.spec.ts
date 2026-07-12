import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { consumeChallenge, createChallenge } from './challenge';

async function challengeCount(): Promise<number> {
	const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM challenges').first<{ n: number }>();
	return row?.n ?? 0;
}

describe('consumeChallenge', () => {
	it('有効期限内の challenge は一度だけ取り出せて、2回目は拒否されること', async () => {
		const id = await createChallenge(env.DB, {
			challenge: 'challenge-value',
			kind: 'registration',
			userId: 'user-1',
			userName: 'taro'
		});

		const row = await consumeChallenge(env.DB, id, 'registration');
		expect(row?.challenge).toBe('challenge-value');
		expect(row?.user_id).toBe('user-1');
		expect(row?.user_name).toBe('taro');

		expect(await consumeChallenge(env.DB, id, 'registration')).toBeNull();
	});

	it('期限切れの challenge は取り出せず、行も残らないこと', async () => {
		await env.DB.prepare(
			'INSERT INTO challenges (id, challenge, kind, user_id, user_name, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
		)
			.bind('expired-id', 'challenge-value', 'registration', null, null, Date.now() - 1)
			.run();

		expect(await consumeChallenge(env.DB, 'expired-id', 'registration')).toBeNull();
		expect(await challengeCount()).toBe(0);
	});

	it('kind が一致しない challenge は取り出せないこと', async () => {
		const id = await createChallenge(env.DB, {
			challenge: 'challenge-value',
			kind: 'registration'
		});

		expect(await consumeChallenge(env.DB, id, 'authentication')).toBeNull();
	});

	it('存在しない id では null が返ること', async () => {
		expect(await consumeChallenge(env.DB, 'no-such-id', 'registration')).toBeNull();
	});
});
