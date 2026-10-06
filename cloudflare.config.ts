import { bindings, defineConfig } from 'cf/config';

// D1 のマイグレーションは既定の ./migrations に置いているため、
// cf d1 migrations apply に --dir を渡さなくてよい
export default defineConfig({
	worker: {
		name: 'pasu',
		compatibilityDate: '2026-07-12',
		compatibilityFlags: ['nodejs_als'],
		entrypoint: '.svelte-kit/cloudflare/_worker.js',
		workersDev: true,
		previewUrls: true,
		env: {
			DB: bindings.d1({
				name: 'pasu',
				id: 'f3c0e812-aaa5-4575-a6ab-df63dce70350'
			}),
			ASSETS: bindings.assets()
		}
	}
});
