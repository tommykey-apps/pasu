<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { startRegistration } from '@simplewebauthn/browser';
	import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state(false);
	let addError = $state<string | null>(null);

	const dateFormat = new Intl.DateTimeFormat('ja-JP', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Asia/Tokyo'
	});

	async function postJson<T>(path: string, body: unknown): Promise<T> {
		const res = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const responseData: unknown = await res.json();
		if (!res.ok) {
			const message =
				responseData && typeof responseData === 'object' && 'message' in responseData
					? String(responseData.message)
					: `HTTP ${res.status}`;
			throw new Error(message);
		}
		return responseData as T;
	}

	async function addPasskey() {
		busy = true;
		addError = null;
		try {
			const optionsJSON = await postJson<PublicKeyCredentialCreationOptionsJSON>(
				'/api/credentials/options',
				{}
			);
			const registration = await startRegistration({ optionsJSON });
			await postJson('/api/credentials/verify', registration);
			await invalidateAll();
		} catch (e) {
			if (e instanceof Error && e.name === 'InvalidStateError') {
				addError = 'この認証器は既に登録済みです。別の端末やパスワードマネージャーでお試しください';
			} else {
				addError = e instanceof Error ? e.message : String(e);
			}
		} finally {
			busy = false;
		}
	}

	function confirmDelete(event: SubmitEvent) {
		if (!confirm('この passkey をサーバーから削除しますか?')) event.preventDefault();
	}
</script>

<h1>ダッシュボード</h1>
<p><strong>{data.user.name}</strong> さんとしてログイン中です。</p>

{#if form?.message}
	<p class="notice">{form.message}</p>
{/if}

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
			{#if data.credentials.length > 1}
				<form method="POST" action="?/delete" onsubmit={confirmDelete}>
					<input type="hidden" name="credentialId" value={credential.id} />
					<button type="submit">削除</button>
				</form>
			{:else}
				<p class="hint">最後の1本は削除できません(消すと二度とログインできなくなるため)。</p>
			{/if}
		</li>
	{/each}
</ul>

<h2>passkey を追加</h2>
<p>別の端末やパスワードマネージャーにもこのアカウントの passkey を作れます。</p>
<button type="button" onclick={addPasskey} disabled={busy}>
	{busy ? '処理中…' : 'パスキーを追加'}
</button>
{#if addError}
	<p class="error">{addError}</p>
{/if}

<form method="POST" action="?/logout" class="logout">
	<button type="submit">ログアウト</button>
</form>

<style>
	li {
		margin-bottom: 1rem;
	}

	dd {
		overflow-wrap: anywhere;
	}

	.notice {
		color: #1a7f37;
	}

	.error {
		color: #b00020;
	}

	.hint {
		color: #666;
		font-size: 0.9rem;
	}

	.logout {
		margin-top: 2rem;
	}
</style>
