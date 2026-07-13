import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		// vite dev は HMR がテスト操作と干渉するため、ビルド済み出力を wrangler dev(preview)で
		// 配信する。ローカル D1 を使うので事前にマイグレーションを適用する
		command: 'pnpm wrangler d1 migrations apply pasu --local && pnpm build && pnpm preview',
		port: 4173
	},
	use: { baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.{ts,js}'
});
