// DB接続プールとスキーマ初期化・マイグレーション・シード
const { Pool, types } = require('pg');
const { hashPassword } = require('./auth');

// DATE型はタイムゾーン変換せず 'YYYY-MM-DD' の文字列のまま受け取る
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 既存テーブルは維持しつつ、新テーブル追加・既存テーブルへのカラム追加を冪等に行う。
// （CREATE TABLE IF NOT EXISTS と ALTER TABLE ADD COLUMN IF NOT EXISTS で新規DB・既存DBの両対応）
const ddl = `
-- ===== 既存テーブル（初回構築時のみ作成される） =====
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oshi (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'アイドル',
  color TEXT NOT NULL DEFAULT '#8B3A4A',
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oshi_id INTEGER REFERENCES oshi(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'ライブ',
  event_date DATE NOT NULL,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oshi_id INTEGER REFERENCES oshi(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  record_date DATE NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS goods (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oshi_id INTEGER REFERENCES oshi(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'アクスタ',
  price INTEGER,
  image TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oshi_id INTEGER REFERENCES oshi(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== 新テーブル =====
-- 推しマスター（アプリ全体で共有される推しの実体。登録人数の算出元）
CREATE TABLE IF NOT EXISTS oshi_master (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  genre TEXT NOT NULL DEFAULT 'その他',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 共通イベント（管理者が作成。アーティストのライブ等）
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  artist_id INTEGER REFERENCES oshi_master(id) ON DELETE SET NULL,
  event_date DATE NOT NULL,
  location TEXT,
  description TEXT,
  image TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 推し友（相互承認制）
CREATE TABLE IF NOT EXISTS friendships (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

-- チャットルーム（DM・イベントの両方を同じ仕組みで扱う）
CREATE TABLE IF NOT EXISTS chat_rooms (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'dm',
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chat_room_members (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (room_id, user_id)
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- イベント参加者
CREATE TABLE IF NOT EXISTS event_participants (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

-- ===== 第2弾で追加した新テーブル =====
-- 予定共有（フレンド選択式）：どの予定を誰に見せるかを個別管理する
CREATE TABLE IF NOT EXISTS schedule_shares (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  shared_with_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, shared_with_user_id)
);

-- 推しの着せ替え画像（管理者承認制のギャラリー）
CREATE TABLE IF NOT EXISTS oshi_images (
  id SERIAL PRIMARY KEY,
  oshi_master_id INTEGER NOT NULL REFERENCES oshi_master(id) ON DELETE CASCADE,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- チャットルーム単位の共有アルバム
CREATE TABLE IF NOT EXISTS album_photos (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 日記（個人のオタ活日記帳。公開範囲はつぶやきと共通ロジック）
CREATE TABLE IF NOT EXISTS diary_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  related_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  title TEXT,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  oshi_id INTEGER REFERENCES oshi(id) ON DELETE SET NULL,
  oshi_master_id INTEGER REFERENCES oshi_master(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- チャットの既読管理（DM・グループ共通）
CREATE TABLE IF NOT EXISTS chat_message_reads (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

-- ===== 第2弾修正で追加した新テーブル =====
-- 推しの着せ替え：ユーザーごとに、その推しの表示画像として選んだ承認済み画像。
-- 「ユーザー個人のプロフィールアイコン」とは完全に別物。未選択なら oshi_master.image_url を表示。
CREATE TABLE IF NOT EXISTS user_oshi_display_image (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  oshi_master_id INTEGER NOT NULL REFERENCES oshi_master(id) ON DELETE CASCADE,
  oshi_image_id INTEGER REFERENCES oshi_images(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, oshi_master_id)
);

-- 貯金の入出金記録（参戦記録＝支出とは完全に別管理）。
-- 貯金残高 = deposit(入金)合計 − withdrawal(出金)合計 で算出する。
CREATE TABLE IF NOT EXISTS savings_transactions (
  id SERIAL PRIMARY KEY,
  event_participant_id INTEGER NOT NULL REFERENCES event_participants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'deposit'（貯金する） / 'withdrawal'（引き出す）
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Web Push購読情報
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  keys JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== 既存テーブルへのカラム追加 =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE oshi ADD COLUMN IF NOT EXISTS oshi_master_id INTEGER REFERENCES oshi_master(id) ON DELETE SET NULL;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false;
-- 第2弾：予定の時間指定（終日予定はNULL）
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS end_time TIME;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public_all';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS oshi_master_id INTEGER REFERENCES oshi_master(id) ON DELETE SET NULL;

-- 第2弾：既存テーブルへのカラム追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE oshi_master ADD COLUMN IF NOT EXISTS official_url TEXT;
ALTER TABLE oshi_master ADD COLUMN IF NOT EXISTS goods_url TEXT;
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS savings_goal INTEGER;
-- 参戦記録をイベントに紐付け（イベント履歴・貯金進捗の集計に使用）
ALTER TABLE records ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL;
-- チャットの添付（画像/ファイル/動画）
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
`;

// 既存データ用のバックフィルとシード投入
async function migrateAndSeed() {
  // 既存の個人推しに oshi_master を紐付ける（同名はまとめる）
  const orphans = await pool.query('SELECT id, name, category FROM oshi WHERE oshi_master_id IS NULL');
  for (const r of orphans.rows) {
    const genre = r.category || 'その他';
    const m = await pool.query(
      `INSERT INTO oshi_master (name, genre) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [r.name, genre]);
    await pool.query('UPDATE oshi SET oshi_master_id = $1 WHERE id = $2', [m.rows[0].id, r.id]);
  }
  // 既存投稿に oshi_master_id をバックフィル
  await pool.query(
    `UPDATE posts p SET oshi_master_id = o.oshi_master_id
     FROM oshi o WHERE p.oshi_id = o.id AND p.oshi_master_id IS NULL`);
  // display_name が未設定なら username で埋める
  await pool.query('UPDATE users SET display_name = username WHERE display_name IS NULL');

  // 第2弾：旧 is_shared フラグ（共有する/しない）を schedule_shares（フレンド選択式）へ移行する。
  // is_shared=true の予定を「その時点の推し友全員に共有した状態」として展開する。
  // 既に共有先が登録されている予定は移行しない（冪等）。
  await pool.query(`
    INSERT INTO schedule_shares (schedule_id, shared_with_user_id)
    SELECT s.id, f.uid
    FROM schedules s
    JOIN LATERAL (
      SELECT CASE WHEN fr.requester_id = s.user_id THEN fr.addressee_id ELSE fr.requester_id END AS uid
      FROM friendships fr
      WHERE fr.status = 'accepted' AND (fr.requester_id = s.user_id OR fr.addressee_id = s.user_id)
    ) f ON true
    WHERE s.is_shared = true
      AND NOT EXISTS (SELECT 1 FROM schedule_shares ss WHERE ss.schedule_id = s.id)
    ON CONFLICT DO NOTHING
  `);

  // 管理者アカウント（初期シード）。ログインID: admin / パスワード: oshilog-admin
  const admin = await pool.query("SELECT id, is_admin FROM users WHERE username = 'admin'");
  let adminId;
  if (!admin.rows.length) {
    const h = await hashPassword('oshilog-admin');
    const ins = await pool.query(
      "INSERT INTO users (username, password_hash, display_name, is_admin) VALUES ('admin', $1, '管理者', true) RETURNING id", [h]);
    adminId = ins.rows[0].id;
  } else {
    adminId = admin.rows[0].id;
    if (!admin.rows[0].is_admin) await pool.query("UPDATE users SET is_admin = true WHERE id = $1", [adminId]);
  }

  // 旧デモユーザー(demo)にパスワードを設定して引き続きログインできるようにする（パスワード: demo）
  const demo = await pool.query("SELECT id, password_hash FROM users WHERE username = 'demo'");
  if (demo.rows.length && !demo.rows[0].password_hash) {
    const h = await hashPassword('demo');
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [h, demo.rows[0].id]);
  }

  // デモ用の共通イベントを用意（同名があればスキップ）
  const demoEvents = [
    { name: 'サマーソニック2026', date: '2026-08-15', loc: '幕張メッセ', desc: '夏の大型音楽フェス。複数ステージ同時開催。' },
    { name: 'アニメロサマーライブ2026', date: '2026-08-28', loc: 'さいたまスーパーアリーナ', desc: '声優・アーティストによるアニソンの祭典。' },
    { name: '推しフェス winter', date: '2026-12-20', loc: '東京ドーム', desc: '年末恒例の合同ライブイベント。' },
  ];
  for (const e of demoEvents) {
    const ex = await pool.query('SELECT id FROM events WHERE name = $1', [e.name]);
    if (!ex.rows.length) {
      await pool.query(
        'INSERT INTO events (name, event_date, location, description, created_by) VALUES ($1, $2, $3, $4, $5)',
        [e.name, e.date, e.loc, e.desc, adminId]);
    }
  }
}

async function initDb() {
  await pool.query(ddl);
  await migrateAndSeed();
}

module.exports = { pool, initDb };
