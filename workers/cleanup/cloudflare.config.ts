import { bindings, defineConfig, triggers } from 'cf/config';

export default defineConfig({
	worker: {
		name: 'pasu-cleanup',
		compatibilityDate: '2026-07-12',
		entrypoint: 'index.ts',
		// 毎日 18:00 UTC = 3:00 JST
		triggers: [triggers.scheduled({ schedule: '0 18 * * *' })],
		env: {
			DB: bindings.d1({
				name: 'pasu',
				id: 'f3c0e812-aaa5-4575-a6ab-df63dce70350'
			})
		}
	}
});
