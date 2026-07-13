// 【読み方】Cron Trigger 専用の小さな Worker。公式の adapter-cloudflare は
// fetch ハンドラしかエクスポートできないため(sveltejs/kit#4841)、
// scheduled はアプリ本体と別 Worker にして同じ D1 に接続している
import { cleanup } from '../../src/lib/server/cleanup';

export default {
	async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
		const result = await cleanup(env.DB, Date.now());
		console.log(
			`cleanup: ${result.staleUsers} 件の放置ユーザーと ${result.expiredChallenges} 件の期限切れ challenge を削除`
		);
	}
} satisfies ExportedHandler<Env>;
