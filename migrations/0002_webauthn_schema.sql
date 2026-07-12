-- Migration number: 0002 	 2026-07-12
DROP TABLE healthcheck;

-- id は WebAuthn の user.id(サーバー発行のランダム値、base64url)。
-- name はただの表示ラベルであり、ユーザーの識別には使わないため UNIQUE にしない
CREATE TABLE users (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

-- id は認証器が発行する credential ID(base64url)。public_key は COSE 公開鍵の base64url
CREATE TABLE credentials (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	public_key TEXT NOT NULL,
	counter INTEGER NOT NULL,
	transports TEXT NOT NULL,
	aaguid TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	last_used_at INTEGER
);

CREATE INDEX credentials_user_id ON credentials (user_id);

-- セレモニー2往復の間だけ生きる使い捨て challenge。検証時に DELETE してリプレイを防ぐ。
-- 登録セレモニーでは user がまだ存在しないため、確定前のユーザー情報もここに持つ
CREATE TABLE challenges (
	id TEXT PRIMARY KEY,
	challenge TEXT NOT NULL,
	kind TEXT NOT NULL,
	user_id TEXT,
	user_name TEXT,
	expires_at INTEGER NOT NULL
);
