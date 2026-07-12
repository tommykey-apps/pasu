<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>pasu</h1>
<p>passkey(WebAuthn)の学習用サンプルアプリ。</p>
<p>D1 疎通確認: {data.d1Note ?? 'まだデータがありません'}</p>
