// 【読み方】passkey 削除のビジネスルール。WebAuthn のセレモニーは登場しない

export type DeleteCredentialResult = 'deleted' | 'last_credential' | 'not_found';

// 「最後の1本を消すと二度とログインできない」ため、削除のガードは
// UI の無効化ではなくここ(サーバー側)を本体とする
export async function deleteCredential(
	db: D1Database,
	userId: string,
	credentialId: string
): Promise<DeleteCredentialResult> {
	const target = await db
		.prepare('SELECT COUNT(*) AS total FROM credentials WHERE user_id = ?1')
		.bind(userId)
		.first<{ total: number }>();
	const owned = await db
		.prepare('SELECT 1 AS found FROM credentials WHERE id = ?1 AND user_id = ?2')
		.bind(credentialId, userId)
		.first<{ found: number }>();

	if (!owned) return 'not_found';
	if ((target?.total ?? 0) <= 1) return 'last_credential';

	await db
		.prepare('DELETE FROM credentials WHERE id = ?1 AND user_id = ?2')
		.bind(credentialId, userId)
		.run();
	return 'deleted';
}
