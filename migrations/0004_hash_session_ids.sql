-- Migration number: 0004 	 2026-11-15
-- sessions.id にセッション ID の SHA-256 を保存する方式に変えた。
-- 既存の行は ID をそのまま保存しているので照合できない。全件消し、利用者には再ログインしてもらう
DELETE FROM sessions;
