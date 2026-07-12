// passkeydeveloper/passkey-authenticator-aaguids のコミュニティ管理データ(name のみに削減)。
// attestation: 'none' でも AAGUID は取得できるが、正確性の保証はないベストエフォート
import names from './aaguid-names.json';

export function authenticatorName(aaguid: string): string {
	return (names as Record<string, string>)[aaguid] ?? '不明な認証器';
}
