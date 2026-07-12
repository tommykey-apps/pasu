// vitest.workers.config.ts の miniflare.bindings で注入するテスト専用バインディング。
// top-level import を書くとこのファイルがモジュール扱いになり
// グローバルな Cloudflare.Env とマージされなくなるため、inline import type を使う
declare namespace Cloudflare {
	interface Env {
		TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
	}
}
