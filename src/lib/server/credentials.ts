// 【読み方】passkey 削除のビジネスルール。WebAuthn のセレモニーは登場しない

export type DeleteCredentialResult = 'deleted' | 'last_credential' | 'not_found';

// 「最後の1本を消すと二度とログインできない」ため、削除のガードは
// UI の無効化ではなくここ(サーバー側)を本体とする。
// 件数の確認と削除を1文で行い、同時に2本消されて0本になる競合を防ぐ
export async function deleteCredential(
	db: D1Database,
	userId: string,
	credentialId: string
): Promise<DeleteCredentialResult> {
	const result = await db
		.prepare(
			'DELETE FROM credentials WHERE id = ?1 AND user_id = ?2 AND (SELECT COUNT(*) FROM credentials WHERE user_id = ?2) > 1'
		)
		.bind(credentialId, userId)
		.run();
	if (result.meta.changes > 0) return 'deleted';

	// 消えなかった理由を、本人の passkey かどうかで分ける
	const owned = await db
		.prepare('SELECT 1 AS found FROM credentials WHERE id = ?1 AND user_id = ?2')
		.bind(credentialId, userId)
		.first<{ found: number }>();
	return owned ? 'last_credential' : 'not_found';
}
