import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';

// CDP の WebAuthn Virtual Authenticator は Chromium 専用。
// Safari/iOS の実機確認は手動で行う方針(issue #8)

interface VirtualAuthenticator {
	cdp: CDPSession;
	authenticatorId: string;
}

async function addVirtualAuthenticator(
	page: Page,
	transport: 'internal' | 'usb' = 'internal'
): Promise<VirtualAuthenticator> {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport,
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
	return { cdp, authenticatorId };
}

async function registerUser(page: Page, name: string) {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('ユーザー名(表示用のラベルです)').fill(name);
	await page.getByRole('button', { name: 'パスキーを登録' }).click();
	await expect(page.getByText('登録できました')).toBeVisible();
}

test('登録 → ログアウト → ユーザー名レスログインの一連が通ること', async ({ page }) => {
	await addVirtualAuthenticator(page);
	await registerUser(page, 'e2e-journey');

	await page.getByRole('button', { name: 'この passkey でログイン' }).click();
	await page.waitForURL('**/dashboard');
	await expect(page.getByText('e2e-journey さんとしてログイン中です')).toBeVisible();

	await page.getByRole('button', { name: 'ログアウト' }).click();
	await page.waitForURL((url) => url.pathname === '/');

	// ユーザー名を入力せずにログインできる
	await page.getByRole('button', { name: 'パスキーでログイン' }).click();
	await page.waitForURL('**/dashboard');
	await expect(page.getByText('e2e-journey さんとしてログイン中です')).toBeVisible();

	// ログインで最終使用日時が記録される
	await expect(page.getByText('未使用')).not.toBeVisible();
});

test('2本目の追加 → 削除 → 最後の1本は削除できないこと', async ({ page }) => {
	const first = await addVirtualAuthenticator(page);
	await registerUser(page, 'e2e-two-keys');
	await page.getByRole('button', { name: 'この passkey でログイン' }).click();
	await page.waitForURL('**/dashboard');

	// 1本だけの間は削除ボタンがなくガード文言が出る
	await expect(page.getByText('最後の1本は削除できません')).toBeVisible();

	// 同じ認証器のままの追加は excludeCredentials で拒否される
	await page.getByRole('button', { name: 'パスキーを追加' }).click();
	await expect(page.getByText('既に登録済み')).toBeVisible();

	// 別の認証器に差し替えて2本目を追加する
	await first.cdp.send('WebAuthn.removeVirtualAuthenticator', {
		authenticatorId: first.authenticatorId
	});
	await addVirtualAuthenticator(page, 'usb');
	await page.getByRole('button', { name: 'パスキーを追加' }).click();
	await expect(page.locator('li')).toHaveCount(2);

	// 2本あれば削除できる
	page.on('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: '削除', exact: true }).first().click();
	await expect(page.getByText('サーバーから削除しました')).toBeVisible();
	await expect(page.locator('li')).toHaveCount(1);
	await expect(page.getByText('最後の1本は削除できません')).toBeVisible();
});

test('認証器が応答できない場合、キャンセル用の文言が表示されること', async ({ page }) => {
	// ユーザー検証(UV)に失敗する認証器を用意すると、ブラウザは NotAllowedError を返す。
	// これがユーザーがダイアログを閉じた場合と同じエラーになる
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: false,
			automaticPresenceSimulation: true
		}
	});

	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('ユーザー名(表示用のラベルです)').fill('e2e-cancel');
	await page.getByRole('button', { name: 'パスキーを登録' }).click();
	await expect(page.getByText('キャンセルされました')).toBeVisible();
});

test('WebAuthn 非対応ブラウザでは非対応メッセージが出てボタンが表示されないこと', async ({
	page
}) => {
	await page.addInitScript(() => {
		// @ts-expect-error 非対応ブラウザの再現のために意図的に消す
		delete window.PublicKeyCredential;
	});
	await page.goto('/');
	await expect(page.getByText('このブラウザはパスキーに対応していません')).toBeVisible();
	await expect(page.getByRole('button', { name: 'パスキーでログイン' })).not.toBeVisible();
});
