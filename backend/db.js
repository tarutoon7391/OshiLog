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

-- ===== 第3弾で追加した新テーブル =====
-- ブロック（判定は必ずサーバー側で行う）
CREATE TABLE IF NOT EXISTS blocks (
  id SERIAL PRIMARY KEY,
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

-- トーク一覧のピン止め（ユーザーごと）
CREATE TABLE IF NOT EXISTS pinned_chats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, room_id)
);

-- ===== 第4弾で追加した新テーブル =====
-- 会場（venue）マスター：イベント会場を独立して管理し、地図表示・最寄り駅ルートに使う。
-- 登録・編集は管理者のみ（判定はサーバー側）。最寄り駅・運賃メモ（fare_note）は任意項目。
CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  nearest_station TEXT,          -- 最寄り駅（任意）
  fare_note TEXT,                -- 概算運賃・所要時間などの自由記述メモ（任意）
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
-- クライアント（発注者・レビュー担当）用のロール。専用メニュー＋サイト案内AIを使える。
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_client BOOLEAN NOT NULL DEFAULT false;

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

-- 第4弾：イベントに会場マスターを紐付け（任意。地図表示・アクセス情報に使用）
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL;

-- 第8弾：イベントリマインドのカウントダウン化。
-- 「最後に通知した残り日数」を持ち、同じ段階（14/7/3/2/1/0日前）を二重送信しないようにする。
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS last_reminded_days INTEGER;
-- 旧方式（reminded=前日通知済み）からの引き継ぎ：当日通知だけは新方式でも届くよう1日前扱いにする
UPDATE event_participants SET last_reminded_days = 1 WHERE reminded = true AND last_reminded_days IS NULL;

-- 第12弾：予定に関連URL（チケットサイト・配信ページ等。任意）を追加
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS url TEXT;
-- 第12弾：予定の個別リマインド（何分前に通知するか。NULL＝リマインドなし）。
-- reminder_sent_at は送信済み印（同じ予定への二重送信を防ぐ。日時やタイミングを変更したらリセット）
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS reminder_offset_minutes INTEGER;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
-- 第12弾：推し友申請を自動的に拒否する設定（デフォルトはオフ）
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_reject_requests BOOLEAN NOT NULL DEFAULT false;

-- 第14弾：参加イベントごとの重要度（normal / important / very_important）。
-- 重要度に応じてカレンダー・ホーム・イベント一覧などの表示色が変わる
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS importance TEXT NOT NULL DEFAULT 'normal';
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

  // つぶやきの公開範囲を2種類（public_all / public_same_oshi）へ整理する移行（データは消さない）。
  // - public_same_event だった投稿 → イベントチャットで代替するため public_all に変換（event_idも外す）
  // - private だった投稿 → 投稿者本人のみ閲覧可能な状態のまま維持（visibilityは触らない）
  await pool.query("UPDATE posts SET visibility = 'public_all', event_id = NULL WHERE visibility = 'public_same_event'");

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

  // クライアント（発注者・レビュー担当）アカウント（初期シード）。ログインID: client / パスワード: oshilog-client
  // 専用の「クライアントメニュー」＋サイト案内AIを使える（is_client）。
  const client = await pool.query("SELECT id, is_client FROM users WHERE username = 'client'");
  if (!client.rows.length) {
    const h = await hashPassword('oshilog-client');
    await pool.query(
      "INSERT INTO users (username, password_hash, display_name, is_client) VALUES ('client', $1, 'クライアント', true)", [h]);
  } else if (!client.rows[0].is_client) {
    await pool.query("UPDATE users SET is_client = true WHERE id = $1", [client.rows[0].id]);
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

  // 全国の著名な会場（ライブ・コンサート会場）を会場マスターにシード（同名があればスキップ＝冪等）。
  // 緯度経度は概算。管理者が「🛠 管理 → 会場」からいつでも編集・追加できる。
  const venueSeed = [
    // ドーム・スタジアム
    { name: '東京ドーム', address: '東京都文京区後楽1-3-61', lat: 35.7056, lng: 139.7519, station: '水道橋駅' },
    { name: '横浜アリーナ', address: '神奈川県横浜市港北区新横浜3-10', lat: 35.5121, lng: 139.6172, station: '新横浜駅' },
    { name: '日産スタジアム', address: '神奈川県横浜市港北区小机町3300', lat: 35.5099, lng: 139.6062, station: '小机駅' },
    { name: '京セラドーム大阪', address: '大阪府大阪市西区千代崎3-中2-1', lat: 34.6693, lng: 135.4761, station: 'ドーム前千代崎駅' },
    { name: '大阪城ホール', address: '大阪府大阪市中央区大阪城3-1', lat: 34.6873, lng: 135.5320, station: '大阪城公園駅' },
    { name: 'バンテリンドーム ナゴヤ', address: '愛知県名古屋市東区大幸南1-1-1', lat: 35.1866, lng: 136.9474, station: 'ナゴヤドーム前矢田駅' },
    { name: 'みずほPayPayドーム福岡', address: '福岡県福岡市中央区地行浜2-2-2', lat: 33.5953, lng: 130.3623, station: '唐人町駅' },
    { name: '札幌ドーム', address: '北海道札幌市豊平区羊ケ丘1', lat: 43.0150, lng: 141.4097, station: '福住駅' },
    { name: 'ベルーナドーム', address: '埼玉県所沢市上山口2135', lat: 35.7595, lng: 139.4210, station: '西武球場前駅' },
    { name: '阪神甲子園球場', address: '兵庫県西宮市甲子園町1-82', lat: 34.7211, lng: 135.3617, station: '甲子園駅' },
    { name: '国立競技場', address: '東京都新宿区霞ヶ丘町10-1', lat: 35.6778, lng: 139.7147, station: '国立競技場駅' },
    { name: '味の素スタジアム', address: '東京都調布市西町376-3', lat: 35.6647, lng: 139.5272, station: '飛田給駅' },
    { name: 'ZOZOマリンスタジアム', address: '千葉県千葉市美浜区美浜1', lat: 35.6453, lng: 140.0308, station: '海浜幕張駅' },
    { name: '横浜スタジアム', address: '神奈川県横浜市中区横浜公園', lat: 35.4433, lng: 139.6402, station: '関内駅' },
    { name: '明治神宮野球場', address: '東京都新宿区霞ヶ丘町3-1', lat: 35.6748, lng: 139.7170, station: '外苑前駅' },
    { name: 'MAZDA Zoom-Zoom スタジアム広島', address: '広島県広島市南区南蟹屋2-3-1', lat: 34.3915, lng: 132.4840, station: '広島駅' },
    { name: 'ヤンマースタジアム長居', address: '大阪府大阪市東住吉区長居公園1-1', lat: 34.6132, lng: 135.5175, station: '長居駅' },
    // アリーナ・ホール・展示場
    { name: '日本武道館', address: '東京都千代田区北の丸公園2-3', lat: 35.6934, lng: 139.7500, station: '九段下駅' },
    { name: 'さいたまスーパーアリーナ', address: '埼玉県さいたま市中央区新都心8', lat: 35.8950, lng: 139.6306, station: 'さいたま新都心駅' },
    { name: '幕張メッセ', address: '千葉県千葉市美浜区中瀬2-1', lat: 35.6479, lng: 140.0347, station: '海浜幕張駅' },
    { name: '東京国際フォーラム', address: '東京都千代田区丸の内3-5-1', lat: 35.6772, lng: 139.7630, station: '有楽町駅' },
    { name: '国立代々木競技場第一体育館', address: '東京都渋谷区神南2-1-1', lat: 35.6672, lng: 139.7000, station: '原宿駅' },
    { name: '東京体育館', address: '東京都渋谷区千駄ヶ谷1-17-1', lat: 35.6809, lng: 139.7148, station: '千駄ケ谷駅' },
    { name: '有明アリーナ', address: '東京都江東区有明1-11-1', lat: 35.6419, lng: 139.7947, station: '有明駅' },
    { name: '東京ガーデンシアター', address: '東京都江東区有明2-1-6', lat: 35.6350, lng: 139.7930, station: '有明駅' },
    { name: 'ぴあアリーナMM', address: '神奈川県横浜市西区みなとみらい3-6-2', lat: 35.4585, lng: 139.6350, station: 'みなとみらい駅' },
    { name: 'Kアリーナ横浜', address: '神奈川県横浜市西区みなとみらい6-2-14', lat: 35.4667, lng: 139.6270, station: '新高島駅' },
    { name: 'パシフィコ横浜 国立大ホール', address: '神奈川県横浜市西区みなとみらい1-1-1', lat: 35.4585, lng: 139.6360, station: 'みなとみらい駅' },
    { name: '神戸ワールド記念ホール', address: '兵庫県神戸市中央区港島中町6-12-2', lat: 34.6620, lng: 135.2130, station: '市民広場駅' },
    { name: '日本ガイシホール', address: '愛知県名古屋市南区東又兵ヱ町5-1-16', lat: 35.1044, lng: 136.9400, station: '笠寺駅' },
    { name: '広島グリーンアリーナ', address: '広島県広島市中区基町4-1', lat: 34.4010, lng: 132.4560, station: '紙屋町西駅' },
    { name: 'マリンメッセ福岡', address: '福岡県福岡市博多区沖浜町7-1', lat: 33.6060, lng: 130.4160, station: null },
    { name: '真駒内セキスイハイムアイスアリーナ', address: '北海道札幌市南区真駒内公園1-1', lat: 42.9946, lng: 141.3480, station: '真駒内駅' },
    { name: 'セキスイハイムスーパーアリーナ', address: '宮城県宮城郡利府町菅谷字舘40-1', lat: 38.3300, lng: 140.9600, station: '利府駅' },
    { name: '沖縄アリーナ', address: '沖縄県沖縄市山内1-16-1', lat: 26.3236, lng: 127.8060, station: null },
    { name: 'NHKホール', address: '東京都渋谷区神南2-2-1', lat: 35.6676, lng: 139.6949, station: '原宿駅' },
    { name: '大阪フェスティバルホール', address: '大阪府大阪市北区中之島2-3-18', lat: 34.6930, lng: 135.4970, station: '肥後橋駅' },
    { name: 'Aichi Sky Expo（愛知県国際展示場）', address: '愛知県常滑市セントレア5-10-1', lat: 34.8580, lng: 136.8130, station: '中部国際空港駅' },
    { name: 'インテックス大阪', address: '大阪府大阪市住之江区南港北1-5-102', lat: 34.6390, lng: 135.4230, station: '中ふ頭駅' },
    { name: 'ポートメッセなごや', address: '愛知県名古屋市港区金城ふ頭2-2', lat: 35.0470, lng: 136.8480, station: '金城ふ頭駅' },
    { name: 'エコパアリーナ', address: '静岡県袋井市愛野2300-1', lat: 34.7420, lng: 137.9280, station: '愛野駅' },
  ].filter((v) => v.name && v.lat && v.lng); // プレースホルダ等の不正データを除外
  for (const v of venueSeed) {
    const ex = await pool.query('SELECT 1 FROM venues WHERE name = $1', [v.name]);
    if (!ex.rows.length) {
      await pool.query(
        'INSERT INTO venues (name, address, latitude, longitude, nearest_station, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
        [v.name, v.address, v.lat, v.lng, v.station || null, adminId]);
    }
  }

  // デモイベントの会場（location名が会場名と一致するもの）を紐付ける（未設定のときだけ。地図をすぐ試せるように）
  await pool.query(
    'UPDATE events e SET venue_id = v.id FROM venues v WHERE e.venue_id IS NULL AND e.location = v.name');
}

async function initDb() {
  await pool.query(ddl);
  await migrateAndSeed();
}

module.exports = { pool, initDb };
