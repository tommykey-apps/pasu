import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// D1 に触るテストは Workers ランタイム(workerd)で実行する必要があるため、
// vite.config.ts の node プロジェクトとは別設定にしている
export default defineConfig(async () => {
	const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));

	return {
		plugins: [
			cloudflareTest({
				wrangler: { configPath: './tests/wrangler.jsonc' },
				miniflare: {
					bindings: { TEST_MIGRATIONS: migrations }
				}
			})
		],
		test: {
			name: 'workers',
			include: ['src/**/*.d1.{test,spec}.ts'],
			setupFiles: ['./tests/apply-migrations.ts']
		}
	};
});
