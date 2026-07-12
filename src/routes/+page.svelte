<script lang="ts">
	import { goto } from '$app/navigation';
	import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
	import type {
		PublicKeyCredentialCreationOptionsJSON,
		PublicKeyCredentialRequestOptionsJSON
	} from '@simplewebauthn/browser';
	import type { PageProps } from './$types';

	interface RegisteredResult {
		user: { id: string; name: string };
		credential: { id: string; aaguid: string; transports: string[]; counter: number };
	}

	let { data }: PageProps = $props();

	let name = $state('');
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);
	let result = $state<RegisteredResult | null>(null);

	async function postJson<T>(path: string, body: unknown): Promise<T> {
		const res = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data: unknown = await res.json();
		if (!res.ok) {
			const message =
				data && typeof data === 'object' && 'message' in data
					? String(data.message)
					: `HTTP ${res.status}`;
			throw new Error(message);
		}
		return data as T;
	}

	async function register(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		errorMessage = null;
		try {
			const optionsJSON = await postJson<PublicKeyCredentialCreationOptionsJSON>(
				'/api/register/options',
				{ name }
			);
			const registration = await startRegistration({ optionsJSON });
			result = await postJson<RegisteredResult>('/api/register/verify', registration);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function login() {
		busy = true;
		errorMessage = null;
		try {
			const optionsJSON = await postJson<PublicKeyCredentialRequestOptionsJSON>(
				'/api/login/options',
				{}
			);
			const authentication = await startAuthentication({ optionsJSON });
			await postJson('/api/login/verify', authentication);
			await goto('/dashboard', { invalidateAll: true });
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<h1>pasu</h1>
<p>passkey(WebAuthn)の学習用サンプルアプリ。</p>

{#if data.user}
	<p>
		<a href="/dashboard"><strong>{data.user.name}</strong> さんとしてログイン中 → ダッシュボード</a>
	</p>
{:else if result}
	<section>
		<h2>登録できました 🎉</h2>
		<p>サーバーの D1 には次の情報だけが保存されています(秘密鍵は端末から出ません):</p>
		<dl>
			<dt>ユーザー名</dt>
			<dd>{result.user.name}</dd>
			<dt>user.id(サーバー発行のランダム識別子)</dt>
			<dd><code>{result.user.id}</code></dd>
			<dt>credential ID(認証器発行)</dt>
			<dd><code>{result.credential.id}</code></dd>
			<dt>AAGUID(認証器の種類)</dt>
			<dd><code>{result.credential.aaguid}</code></dd>
			<dt>transports</dt>
			<dd><code>{result.credential.transports.join(', ') || '(なし)'}</code></dd>
			<dt>署名カウンター</dt>
			<dd>{result.credential.counter}</dd>
		</dl>
		<p><button type="button" onclick={login} disabled={busy}>この passkey でログイン</button></p>
	</section>
{:else}
	<section>
		<h2>ログイン</h2>
		<p>登録済みなら、ユーザー名の入力は要りません。</p>
		<button type="button" onclick={login} disabled={busy}>
			{busy ? '処理中…' : 'パスキーでログイン'}
		</button>
	</section>

	<section>
		<h2>はじめての方(登録)</h2>
		<form onsubmit={register}>
			<label>
				ユーザー名(表示用のラベルです)
				<input name="name" bind:value={name} maxlength="64" required disabled={busy} />
			</label>
			<button type="submit" disabled={busy}>
				{busy ? '処理中…' : 'パスキーを登録'}
			</button>
		</form>
	</section>
{/if}

{#if errorMessage}
	<p class="error">{errorMessage}</p>
{/if}

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 24rem;
	}

	.error {
		color: #b00020;
	}

	dd {
		overflow-wrap: anywhere;
	}
</style>
