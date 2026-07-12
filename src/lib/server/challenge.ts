const TTL_MS = 5 * 60 * 1000;

export type ChallengeKind = 'registration' | 'authentication';

export interface ChallengeRow {
	id: string;
	challenge: string;
	kind: ChallengeKind;
	user_id: string | null;
	user_name: string | null;
	expires_at: number;
}

export async function createChallenge(
	db: D1Database,
	params: { challenge: string; kind: ChallengeKind; userId?: string; userName?: string }
): Promise<string> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			'INSERT INTO challenges (id, challenge, kind, user_id, user_name, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
		)
		.bind(
			id,
			params.challenge,
			params.kind,
			params.userId ?? null,
			params.userName ?? null,
			Date.now() + TTL_MS
		)
		.run();
	return id;
}

// 取り出しと削除を1文で行い、検証の成否にかかわらず challenge を使い捨てにする。
// 期限切れは削除後に判定して null を返す(どのみち再利用させないので削除してよい)
export async function consumeChallenge(
	db: D1Database,
	id: string,
	kind: ChallengeKind
): Promise<ChallengeRow | null> {
	const row = await db
		.prepare('DELETE FROM challenges WHERE id = ?1 AND kind = ?2 RETURNING *')
		.bind(id, kind)
		.first<ChallengeRow>();
	if (!row || row.expires_at <= Date.now()) return null;
	return row;
}
