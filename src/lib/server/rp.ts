export const rpName = 'pasu';

// RP ID をハードコードせずリクエスト URL から導出する。
// localhost(開発)と workers.dev(本番)を同じコードで動かすためで、
// origin の同一性は verifyRegistrationResponse の expectedOrigin 検証で担保される
export function rpFromUrl(url: URL): { rpID: string; origin: string } {
	return { rpID: url.hostname, origin: url.origin };
}
