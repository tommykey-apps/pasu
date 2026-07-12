-- Migration number: 0001 	 2026-07-12
-- 疎通確認用のダミーテーブル。本来のスキーマは登録セレモニー実装時に追加する
CREATE TABLE healthcheck (
	id INTEGER PRIMARY KEY,
	note TEXT NOT NULL
);

INSERT INTO healthcheck (note) VALUES ('D1 is alive');
