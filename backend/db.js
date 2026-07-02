// DB接続プールとスキーマ初期化
const { Pool, types } = require('pg');

// DATE型はタイムゾーン変換せず 'YYYY-MM-DD' の文字列のまま受け取る
// （Dateオブジェクトに変換されると日付がずれる事故が起きるため）
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// プロトタイプにつきマイグレーションツールは使わず、起動時にCREATE TABLE IF NOT EXISTSで初期化する
const initSql = `
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 推し（名前・カテゴリ・推しカラー・画像）
CREATE TABLE IF NOT EXISTS oshi (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'アイドル',
  color      TEXT NOT NULL DEFAULT '#ec4899',
  image      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- スケジュール（ライブ・配信・グッズ発売日など）
-- 推しを削除しても予定自体は残す（oshi_idはNULLになる）
CREATE TABLE IF NOT EXISTS schedules (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oshi_id    INTEGER REFERENCES oshi(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'ライブ',
  event_date DATE NOT NULL,
  memo       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 参戦記録・オタ活家計簿（金額は円の整数）
CREATE TABLE IF NOT EXISTS records (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oshi_id     INTEGER REFERENCES oshi(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  record_date DATE NOT NULL,
  amount      INTEGER NOT NULL DEFAULT 0,
  memo        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- グッズコレクション
CREATE TABLE IF NOT EXISTS goods (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oshi_id    INTEGER REFERENCES oshi(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'アクスタ',
  price      INTEGER,
  image      TEXT,
  memo       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- つぶやき（アプリ内完結・SNS連携なし）
CREATE TABLE IF NOT EXISTS posts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oshi_id    INTEGER REFERENCES oshi(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function initDb() {
  await pool.query(initSql);
}

module.exports = { pool, initDb };
