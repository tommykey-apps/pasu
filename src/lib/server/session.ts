// 【読み方】ここから先は WebAuthn とは無関係の、ただのセッション管理。
// 認証セレモニー成功(login/verify)の後にユーザーをログイン状態に保つ仕組みで、
// パスワード認証だったとしても同じコードになる

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE_SECONDS = TTL_MS / 1000;

export interface SessionUser {
	id: string;
	name: string;
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
	// セッション ID は推測不能であることが唯一の要件なので、128bit の乱数で足りる
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	await db
		.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)')
		.bind(id, userId, Date.now() + TTL_MS)
		.run();
	return id;
}

// 検証のたびに期限を延長する(スライディング方式)。
// 毎リクエスト UPDATE が走るが、デモの規模では最適化より単純さを優先する
export async function validateSession(db: D1Database, id: string): Promise<SessionUser | null> {
	const row = await db
		.prepare(
			'SELECT s.expires_at, u.id AS user_id, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?1'
		)
		.bind(id)
		.first<{ expires_at: number; user_id: string; name: string }>();
	if (!row) return null;

	if (row.expires_at <= Date.now()) {
		await deleteSession(db, id);
		return null;
	}

	await db
		.prepare('UPDATE sessions SET expires_at = ?2 WHERE id = ?1')
		.bind(id, Date.now() + TTL_MS)
		.run();
	return { id: row.user_id, name: row.name };
}

export async function deleteSession(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM sessions WHERE id = ?1').bind(id).run();
}
