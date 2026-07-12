<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dateFormat = new Intl.DateTimeFormat('ja-JP', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Asia/Tokyo'
	});
</script>

<h1>ダッシュボード</h1>
<p><strong>{data.user.name}</strong> さんとしてログイン中です。</p>

<h2>登録済みの passkey</h2>
<ul>
	{#each data.credentials as credential (credential.id)}
		<li>
			<strong>{credential.authenticator}</strong>
			<dl>
				<dt>credential ID</dt>
				<dd><code>{credential.id}</code></dd>
				<dt>作成日時</dt>
				<dd>{dateFormat.format(credential.createdAt)}</dd>
				<dt>最終使用日時</dt>
				<dd>{credential.lastUsedAt ? dateFormat.format(credential.lastUsedAt) : '未使用'}</dd>
			</dl>
		</li>
	{/each}
</ul>

<form method="POST" action="?/logout">
	<button type="submit">ログアウト</button>
</form>

<style>
	li {
		margin-bottom: 1rem;
	}

	dd {
		overflow-wrap: anywhere;
	}
</style>
