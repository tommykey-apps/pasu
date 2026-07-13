// 【読み方】ブラウザの WebAuthn API が投げる DOMException をユーザー向け文言に変換する。
// Safari は excludeCredentials に該当した場合も NotAllowedError にまとめることがあるため、
// キャンセルと登録済みを断定せず両方に触れる文言にしている
export function webauthnErrorMessage(e: unknown): string {
	if (e instanceof Error) {
		if (e.name === 'NotAllowedError') {
			return 'キャンセルされました(または、この端末の認証器が既に登録済みです)。もう一度お試しください';
		}
		if (e.name === 'InvalidStateError') {
			return 'この認証器は既に登録済みです。別の端末やパスワードマネージャーでお試しください';
		}
		return `エラーが発生しました: ${e.message}`;
	}
	return `エラーが発生しました: ${String(e)}`;
}

export function isPasskeySupported(): boolean {
	return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}
