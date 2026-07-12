import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteCredential } from './credentials';

async function credentialIds(userId: string): Promise<string[]> {
	const { results } = await env.DB.prepare(
		'SELECT id FROM credentials WHERE user_id = ?1 ORDER BY id'
	)
		.bind(userId)
		.all<{ id: string }>();
	return results.map((row) => row.id);
}

async function insertCredential(id: string, userId: string): Promise<void> {
	await env.DB.prepare(
		"INSERT OR IGNORE INTO credentials (id, user_id, public_key, counter, transports, aaguid, created_at) VALUES (?1, ?2, 'pk', 0, '[]', 'aaguid', 0)"
	)
		.bind(id, userId)
		.run();
}

describe('deleteCredential', () => {
	beforeEach(async () => {
		await env.DB.prepare('DELETE FROM credentials').run();
		await env.DB.prepare('DELETE FROM users').run();
		await env.DB.prepare(
			"INSERT INTO users (id, name, created_at) VALUES ('user-1', 'taro', 0), ('user-2', 'jiro', 0)"
		).run();
		await insertCredential('cred-1a', 'user-1');
		await insertCredential('cred-1b', 'user-1');
		await insertCredential('cred-2a', 'user-2');
	});

	it('2本以上あるユーザーの passkey は削除できること', async () => {
		expect(await deleteCredential(env.DB, 'user-1', 'cred-1a')).toBe('deleted');
		expect(await credentialIds('user-1')).toEqual(['cred-1b']);
	});

	it('最後の1本はサーバー側で削除を拒否し、行が残ること', async () => {
		expect(await deleteCredential(env.DB, 'user-2', 'cred-2a')).toBe('last_credential');
		expect(await credentialIds('user-2')).toEqual(['cred-2a']);
	});

	it('他ユーザーの passkey は削除できないこと', async () => {
		expect(await deleteCredential(env.DB, 'user-1', 'cred-2a')).toBe('not_found');
		expect(await credentialIds('user-2')).toEqual(['cred-2a']);
	});

	it('存在しない credential ID は not_found になること', async () => {
		expect(await deleteCredential(env.DB, 'user-1', 'no-such-id')).toBe('not_found');
	});
});
