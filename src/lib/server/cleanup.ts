// 【読み方】公開デモゆえに溜まる放置データの掃除。Cron 専用 Worker
// (workers/cleanup)から呼ばれ、SvelteKit アプリからは使われない

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface CleanupResult {
	staleUsers: number;
	expiredChallenges: number;
}

export async function cleanup(db: D1Database, now: number): Promise<CleanupResult> {
	const cutoff = now - RETENTION_MS;

	// 「90日以内に使われた(未使用なら作られた)credential を1本も持たない user」を削除する。
	// credentials と sessions は FK の ON DELETE CASCADE で一緒に消える。
	// DELETE の meta.changes は CASCADE 分も含んでしまうため、件数は先に数える
	const staleCondition =
		'id NOT IN (SELECT user_id FROM credentials WHERE COALESCE(last_used_at, created_at) > ?1)';
	const staleCount = await db
		.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${staleCondition}`)
		.bind(cutoff)
		.first<{ n: number }>();
	await db.prepare(`DELETE FROM users WHERE ${staleCondition}`).bind(cutoff).run();

	// 途中で放棄されたセレモニーの challenge は consume されないまま残るので、期限切れを掃く
	const challenges = await db
		.prepare('DELETE FROM challenges WHERE expires_at <= ?1')
		.bind(now)
		.run();

	return {
		staleUsers: staleCount?.n ?? 0,
		expiredChallenges: challenges.meta.changes
	};
}
