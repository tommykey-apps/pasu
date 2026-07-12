<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>ダッシュボード</h1>
<p><strong>{data.user.name}</strong> さんとしてログイン中です。</p>

<form method="POST" action="?/logout">
	<button type="submit">ログアウト</button>
</form>
