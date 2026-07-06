// 推しログ バックエンドAPIサーバー（Express + Socket.io + Web Push）
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { pool, initDb } = require('./db');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./auth');
const push = require('./push');
const realtime = require('./realtime');
const ai = require('./ai');

// プロセス全体の保険：想定外の非同期エラーでアプリ全体が落ちるのを防ぐ（本番の可用性を優先）。
// 通知送信のfire-and-forgetやSocket処理など、リクエストのtry/catch外で起きた例外もここで受け止め、
// ログだけ残してプロセスは生かし続ける。
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ 未処理のPromise拒否（プロセスは継続）:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ 未捕捉の例外（プロセスは継続）:', err && err.stack ? err.stack : err);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '6mb' })); // 画像をBase64で受けるため上限を広めに

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  });

// ---- 認証ミドルウェア ----
// Authorization: Bearer <token> を検証して req.userId をセットする
const auth = (req, res, next) => {
  const h = req.header('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const uid = verifyToken(token);
  if (!uid) return res.status(401).json({ error: 'ログインしてください' });
  req.userId = uid;
  next();
};

// 管理者のみ許可（判定は必ずサーバー側のDBで行う）
const admin = (req, res, next) => {
  pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId])
    .then((r) => {
      if (!r.rows.length || !r.rows[0].is_admin) return res.status(403).json({ error: '管理者専用の機能です' });
      next();
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    });
};

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Google Maps 用のクライアント設定。APIキーはサーバーの環境変数のみで管理し、
// フロントのソースには直書きしない（この経路で実行時に受け渡す）。未設定なら enabled:false。
app.get('/api/maps/config', auth, (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  res.json({ enabled: !!key, apiKey: key });
});

// =========================================================
// 認証・ユーザー
// =========================================================
app.post('/api/register', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const displayName = String(req.body.display_name || '').trim() || username;
  if (!username || username.length > 20) return res.status(400).json({ error: 'ユーザーIDは1〜20文字で入力してください' });
  if (password.length < 4) return res.status(400).json({ error: 'パスワードは4文字以上にしてください' });
  const dup = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (dup.rows.length) return res.status(409).json({ error: 'このユーザーIDは既に使われています' });
  const hash = await hashPassword(password);
  const r = await pool.query(
    'INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, display_name, avatar, bio, is_admin, is_client, is_public',
    [username, hash, displayName]);
  const user = r.rows[0];
  res.status(201).json({ user, token: signToken(user.id) });
}));

app.post('/api/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const r = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  if (!r.rows.length || !r.rows[0].password_hash) {
    return res.status(401).json({ error: 'ユーザーIDまたはパスワードが違います' });
  }
  const ok = await verifyPassword(password, r.rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'ユーザーIDまたはパスワードが違います' });
  const u = r.rows[0];
  const user = { id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, bio: u.bio, is_admin: u.is_admin, is_client: u.is_client, is_public: u.is_public };
  res.json({ user, token: signToken(user.id) });
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  const r = await pool.query(
    'SELECT id, username, display_name, avatar, bio, is_admin, is_client, is_public FROM users WHERE id = $1', [req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
}));

app.put('/api/me', auth, wrap(async (req, res) => {
  const { display_name, avatar, bio, is_public } = req.body;
  const r = await pool.query(
    `UPDATE users SET display_name = COALESCE($1, display_name), avatar = $2, bio = $3,
            is_public = COALESCE($4, is_public), updated_at = now()
     WHERE id = $5 RETURNING id, username, display_name, avatar, bio, is_admin, is_client, is_public`,
    [display_name ? String(display_name).slice(0, 20) : null, avatar || null,
     bio ? String(bio).slice(0, 200) : null,
     typeof is_public === 'boolean' ? is_public : null, req.userId]);
  res.json(r.rows[0]);
}));

// =========================================================
// 推し（個人登録）＋ 推しマスター（ブラウズ）
// =========================================================
// 推しの「表示画像」を、ログイン中ユーザーが選んだ承認済み画像（着せ替え）で解決するSQL断片。
// 未選択なら oshi_master.image_url（デフォルト）にフォールバックする。$1 = 閲覧者ユーザーID。
// ユーザー個人のプロフィールアイコンとは完全に別物（users.avatar には一切触れない）。
const displayImageSql = (masterIdCol, defaultImgCol) => `COALESCE(
  (SELECT oi.image_url FROM user_oshi_display_image ud
     JOIN oshi_images oi ON oi.id = ud.oshi_image_id
   WHERE ud.user_id = $1 AND ud.oshi_master_id = ${masterIdCol} AND oi.status = 'approved'),
  ${defaultImgCol})`;

// ジャンルブロック→タイル一覧用。全マスターを登録人数付きで返す（表示画像は閲覧者ごとに解決）
app.get('/api/oshi/browse', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT m.id, m.name, m.genre, m.image_url,
            ${displayImageSql('m.id', 'm.image_url')} AS display_image,
            COUNT(o.id)::int AS registered_count,
            BOOL_OR(o.user_id = $1) AS mine
     FROM oshi_master m
     LEFT JOIN oshi o ON o.oshi_master_id = m.id
     GROUP BY m.id
     ORDER BY registered_count DESC, m.id`, [req.userId]);
  res.json(r.rows);
}));

// 自分が登録している推し（表示画像は自分が選んだ着せ替え画像を優先）
app.get('/api/oshi', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT o.*, m.genre, m.image_url AS master_image,
            ${displayImageSql('o.oshi_master_id', 'm.image_url')} AS display_image,
            (SELECT COUNT(*)::int FROM oshi o2 WHERE o2.oshi_master_id = o.oshi_master_id) AS registered_count
     FROM oshi o LEFT JOIN oshi_master m ON m.id = o.oshi_master_id
     WHERE o.user_id = $1 ORDER BY o.id`, [req.userId]);
  res.json(r.rows);
}));

// 推し登録：同名マスターがあれば紐付け、なければ新規作成（最初の登録者が画像をセット）
app.post('/api/oshi', auth, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const genre = String(req.body.genre || req.body.category || 'その他').trim();
  const color = req.body.color || '#8B3A4A';
  const image = req.body.image || null;
  if (!name) return res.status(400).json({ error: '名前を入力してください' });

  let master = (await pool.query('SELECT * FROM oshi_master WHERE name = $1', [name])).rows[0];
  if (!master) {
    master = (await pool.query(
      'INSERT INTO oshi_master (name, genre, image_url) VALUES ($1, $2, $3) RETURNING *',
      [name, genre, image])).rows[0];
  } else if (!master.image_url && image) {
    // 既存マスターに画像がなければ、今回の画像を代表画像にする
    await pool.query('UPDATE oshi_master SET image_url = $1 WHERE id = $2', [image, master.id]);
    master.image_url = image;
  }

  // 同じ推しの二重登録は防ぐ
  const dup = await pool.query('SELECT 1 FROM oshi WHERE user_id = $1 AND oshi_master_id = $2', [req.userId, master.id]);
  if (dup.rows.length) return res.status(409).json({ error: 'この推しはすでに登録済みです' });

  const r = await pool.query(
    `INSERT INTO oshi (user_id, name, category, color, image, oshi_master_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.userId, name, genre, color, image, master.id]);
  res.status(201).json({ ...r.rows[0], genre: master.genre, master_image: master.image_url });
}));

app.put('/api/oshi/:id', auth, wrap(async (req, res) => {
  const { color, image } = req.body;
  const r = await pool.query(
    `UPDATE oshi SET color = COALESCE($1, color), image = $2, updated_at = now()
     WHERE id = $3 AND user_id = $4 RETURNING *`,
    [color || null, image || null, req.params.id, req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
}));

app.delete('/api/oshi/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM oshi WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// =========================================================
// スケジュール（フレンド選択式の共有。共有された予定も含めて返す）
// =========================================================
// 予定の共有先を「承認済みの推し友のみ」に絞ってサーバー側で検証し、置き換える
async function setScheduleShares(scheduleId, ownerId, sharedWith) {
  await pool.query('DELETE FROM schedule_shares WHERE schedule_id = $1', [scheduleId]);
  const ids = Array.isArray(sharedWith) ? [...new Set(sharedWith.map(Number).filter(Boolean))] : [];
  if (!ids.length) return 0;
  const friends = await pool.query(
    `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS uid
     FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`, [ownerId]);
  const allow = new Set(friends.rows.map((r) => r.uid));
  const valid = ids.filter((id) => allow.has(id));
  for (const uid of valid) {
    await pool.query(
      'INSERT INTO schedule_shares (schedule_id, shared_with_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [scheduleId, uid]);
  }
  return valid.length;
}

const emitScheduleResync = (userIds) => {
  userIds.forEach((uid) => realtime.emitToUser(uid, 'schedule:changed', {}));
};

app.get('/api/schedules', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT s.*, o.name AS oshi_name, o.color AS oshi_color, u.display_name AS owner_name,
            (s.user_id = $1) AS is_own,
            COALESCE((SELECT array_agg(ss.shared_with_user_id) FROM schedule_shares ss
                      WHERE ss.schedule_id = s.id AND s.user_id = $1), '{}') AS shared_user_ids
     FROM schedules s
     LEFT JOIN oshi o ON o.id = s.oshi_id
     JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1
        OR s.id IN (SELECT schedule_id FROM schedule_shares WHERE shared_with_user_id = $1)
     ORDER BY s.event_date, s.start_time NULLS FIRST, s.id`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/schedules', auth, wrap(async (req, res) => {
  const { oshi_id, title, event_type, event_date, memo, start_time, end_time, shared_with } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'タイトルと日付を入力してください' });
  const shareCount = Array.isArray(shared_with) ? shared_with.length : 0;
  const r = await pool.query(
    `INSERT INTO schedules (user_id, oshi_id, title, event_type, event_date, memo, start_time, end_time, is_shared)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.userId, oshi_id || null, title, event_type || 'ライブ', event_date, memo || null,
     start_time || null, end_time || null, shareCount > 0]);
  const n = await setScheduleShares(r.rows[0].id, req.userId, shared_with);
  if (n > 0) emitScheduleResync((shared_with || []).map(Number));
  res.status(201).json(r.rows[0]);
}));

app.put('/api/schedules/:id', auth, wrap(async (req, res) => {
  const { oshi_id, title, event_type, event_date, memo, start_time, end_time, shared_with } = req.body;
  const shareCount = Array.isArray(shared_with) ? shared_with.length : 0;
  const r = await pool.query(
    `UPDATE schedules SET oshi_id = $1, title = $2, event_type = $3, event_date = $4, memo = $5,
            start_time = $6, end_time = $7, is_shared = $8, updated_at = now()
     WHERE id = $9 AND user_id = $10 RETURNING *`,
    [oshi_id || null, title, event_type, event_date, memo || null,
     start_time || null, end_time || null, shareCount > 0, req.params.id, req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  await setScheduleShares(r.rows[0].id, req.userId, shared_with);
  emitScheduleResync((shared_with || []).map(Number));
  res.json(r.rows[0]);
}));

app.delete('/api/schedules/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM schedules WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// =========================================================
// 参戦記録・家計簿
// =========================================================
app.get('/api/records', auth, wrap(async (req, res) => {
  const params = [req.userId];
  let where = 'r.user_id = $1';
  if (req.query.month) {
    params.push(req.query.month);
    where += ` AND to_char(r.record_date, 'YYYY-MM') = $2`;
  }
  const r = await pool.query(
    `SELECT r.*, o.name AS oshi_name, o.color AS oshi_color, e.name AS event_name
     FROM records r LEFT JOIN oshi o ON o.id = r.oshi_id
     LEFT JOIN events e ON e.id = r.event_id
     WHERE ${where} ORDER BY r.record_date DESC, r.id DESC`, params);
  res.json(r.rows);
}));

app.post('/api/records', auth, wrap(async (req, res) => {
  const { oshi_id, title, record_date, amount, memo, event_id } = req.body;
  if (!title || !record_date) return res.status(400).json({ error: '内容と日付を入力してください' });
  const r = await pool.query(
    `INSERT INTO records (user_id, oshi_id, title, record_date, amount, memo, event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.userId, oshi_id || null, title, record_date, Number(amount) || 0, memo || null, event_id || null]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/records/:id', auth, wrap(async (req, res) => {
  const { oshi_id, title, record_date, amount, memo, event_id } = req.body;
  const r = await pool.query(
    `UPDATE records SET oshi_id = $1, title = $2, record_date = $3, amount = $4, memo = $5, event_id = $6, updated_at = now()
     WHERE id = $7 AND user_id = $8 RETURNING *`,
    [oshi_id || null, title, record_date, Number(amount) || 0, memo || null, event_id || null, req.params.id, req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
}));

app.delete('/api/records/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM records WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// =========================================================
// グッズ
// =========================================================
app.get('/api/goods', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT g.*, o.name AS oshi_name, o.color AS oshi_color
     FROM goods g LEFT JOIN oshi o ON o.id = g.oshi_id
     WHERE g.user_id = $1 ORDER BY g.id DESC`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/goods', auth, wrap(async (req, res) => {
  const { oshi_id, name, category, price, image, memo } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'グッズ名を入力してください' });
  const r = await pool.query(
    `INSERT INTO goods (user_id, oshi_id, name, category, price, image, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.userId, oshi_id || null, String(name).trim(), category || 'アクスタ',
     price != null && price !== '' ? Number(price) : null, image || null, memo || null]);
  res.status(201).json(r.rows[0]);
}));

app.delete('/api/goods/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM goods WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// =========================================================
// 公開範囲の共通判定（つぶやき・日記で再利用し、二重管理を避ける）
// alias のレコードを閲覧者 $1 が見られるかどうかのWHERE句を返す。
// 対象テーブルは user_id / visibility / oshi_master_id / event_id を持つ前提。
// =========================================================
function visibilityWhere(alias) {
  return `(
    ${alias}.user_id = $1
    OR ${alias}.visibility = 'public_all'
    OR (${alias}.visibility = 'public_same_oshi' AND ${alias}.oshi_master_id IN (
          SELECT oshi_master_id FROM oshi WHERE user_id = $1 AND oshi_master_id IS NOT NULL))
    OR (${alias}.visibility = 'public_same_event' AND ${alias}.event_id IN (
          SELECT event_id FROM event_participants WHERE user_id = $1))
  )`;
}

// 投稿・日記フォームの公開範囲入力を検証し、oshi_master_id 等を解決する共通処理
async function resolveVisibility({ userId, visibility, oshiId, eventId }) {
  const allowed = ['private', 'public_all', 'public_same_oshi', 'public_same_event'];
  let vis = allowed.includes(String(visibility)) ? String(visibility) : 'public_all';
  let oshiMasterId = null;
  if (oshiId) {
    const o = await pool.query('SELECT oshi_master_id FROM oshi WHERE id = $1 AND user_id = $2', [oshiId, userId]);
    oshiMasterId = o.rows.length ? o.rows[0].oshi_master_id : null;
  }
  if (vis === 'public_same_event' && !eventId) throw { code: 400, message: 'イベントを選択してください' };
  if (vis === 'public_same_oshi' && !oshiMasterId) throw { code: 400, message: '「同じ推し」で公開するには推しを選んでください' };
  return { vis, oshiMasterId, eventId: vis === 'public_same_event' ? eventId : null };
}

// =========================================================
// つぶやき（公開範囲は「全体」「同じ推し」の2種類・サーバー側フィルタリング）
// =========================================================
// つぶやきで選べる公開範囲（プライベートは日記、同じイベントはイベントチャットで代替するため廃止）
const POST_VISIBILITIES = ['public_all', 'public_same_oshi'];

// 投稿を「enrich（推し名・投稿者名を付与）」して1件返す
async function fetchEnrichedPost(id) {
  const r = await pool.query(
    `SELECT p.*, o.name AS oshi_name, o.color AS oshi_color,
            au.display_name AS author_name, au.username AS author_username, au.avatar AS author_avatar
     FROM posts p
     LEFT JOIN oshi o ON o.id = p.oshi_id
     JOIN users au ON au.id = p.user_id
     WHERE p.id = $1`, [id]);
  return r.rows[0];
}

app.get('/api/posts', auth, wrap(async (req, res) => {
  // 閲覧者の条件（本人／全体／同じ推し）に応じてサーバー側で絞り込む。
  // ※ 同じ推し限定は、閲覧者が投稿の oshi_master_id を実際に登録している場合のみ可視。
  const r = await pool.query(
    `SELECT p.*, o.name AS oshi_name, o.color AS oshi_color,
            au.display_name AS author_name, au.username AS author_username, au.avatar AS author_avatar
     FROM posts p
     LEFT JOIN oshi o ON o.id = p.oshi_id
     JOIN users au ON au.id = p.user_id
     WHERE ${visibilityWhere('p')}
       AND NOT EXISTS (SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id)
                OR (b.blocker_id = p.user_id AND b.blocked_id = $1))
     ORDER BY p.id DESC LIMIT 100`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/posts', auth, wrap(async (req, res) => {
  const content = String(req.body.content || '').trim();
  const oshiId = req.body.oshi_id || null;
  if (!content) return res.status(400).json({ error: '内容を入力してください' });
  if (content.length > 300) return res.status(400).json({ error: 'つぶやきは300文字以内にしてください' });

  // つぶやきの公開範囲は2種類に限定（不正・未指定は「全体」に丸める）
  let visibility = POST_VISIBILITIES.includes(req.body.visibility) ? req.body.visibility : 'public_all';
  let resolved;
  try {
    resolved = await resolveVisibility({ userId: req.userId, visibility, oshiId, eventId: null });
  } catch (e) { return res.status(e.code || 400).json({ error: e.message }); }

  const ins = await pool.query(
    `INSERT INTO posts (user_id, oshi_id, content, visibility, oshi_master_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [req.userId, oshiId, content, resolved.vis, resolved.oshiMasterId]);
  const post = await fetchEnrichedPost(ins.rows[0].id);
  realtime.emitNewPost(post); // 公開範囲に応じたルームへリアルタイム配信
  res.status(201).json(post);
}));

app.delete('/api/posts/:id', auth, wrap(async (req, res) => {
  // 投稿者本人のみ削除可（サーバー側で必ず検証）。本人以外は403で拒否する
  const p = await pool.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
  if (!p.rows.length) return res.status(404).json({ error: '見つかりません' });
  if (p.rows[0].user_id !== req.userId) return res.status(403).json({ error: '自分のつぶやきしか削除できません' });
  await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// =========================================================
// 推し友（相互承認制）＋ マッチングおすすめ
// =========================================================
app.get('/api/friends', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT f.id AS friendship_id, u.id, u.display_name, u.username, u.avatar,
            (SELECT id FROM chat_rooms cr
             WHERE cr.type = 'dm' AND cr.id IN (
               SELECT room_id FROM chat_room_members WHERE user_id = $1
               INTERSECT SELECT room_id FROM chat_room_members WHERE user_id = u.id)
             LIMIT 1) AS room_id
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
     WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
     ORDER BY u.display_name`, [req.userId]);
  res.json(r.rows);
}));

app.get('/api/friends/requests', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT f.id AS friendship_id, u.id, u.display_name, u.username, u.avatar
     FROM friendships f JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = $1 AND f.status = 'pending' ORDER BY f.id DESC`, [req.userId]);
  res.json(r.rows);
}));

// 同じ推しを登録しているユーザーをランダムでおすすめ（既に友達／申請中は除外）
app.get('/api/friends/recommendations', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.display_name, u.username, u.avatar,
            array_agg(DISTINCT m.name) AS shared_oshi
     FROM oshi mine
     JOIN oshi_master m ON m.id = mine.oshi_master_id
     JOIN oshi theirs ON theirs.oshi_master_id = m.id AND theirs.user_id <> $1
     JOIN users u ON u.id = theirs.user_id
     WHERE mine.user_id = $1
       AND u.is_public = true
       AND NOT EXISTS (
         SELECT 1 FROM friendships f
         WHERE (f.requester_id = $1 AND f.addressee_id = u.id)
            OR (f.requester_id = u.id AND f.addressee_id = $1))
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
            OR (b.blocker_id = u.id AND b.blocked_id = $1))
     GROUP BY u.id
     ORDER BY random() LIMIT 10`, [req.userId]);
  res.json(r.rows);
}));

// ブロック関係が存在するか（どちら向きでも）をサーバー側で判定
async function isBlockedPair(a, b) {
  const r = await pool.query(
    `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
    [a, b]);
  return r.rows.length > 0;
}

app.post('/api/friends/request', auth, wrap(async (req, res) => {
  const addressee = Number(req.body.addressee_id);
  if (!addressee || addressee === req.userId) return res.status(400).json({ error: '相手が不正です' });
  // ブロック関係があれば申請不可（サーバー側で判定）
  if (await isBlockedPair(req.userId, addressee)) return res.status(403).json({ error: 'この相手には申請できません' });
  // 既存関係のチェック（どちら向きでも）
  const ex = await pool.query(
    `SELECT * FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [req.userId, addressee]);
  if (ex.rows.length) return res.status(409).json({ error: 'すでに申請済み、または推し友です' });
  await pool.query(
    'INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, \'pending\')',
    [req.userId, addressee]);
  const me = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
  realtime.emitToUser(addressee, 'friend:request', { from: me.rows[0].display_name });
  push.sendToUsers(pool, [addressee], { title: '👥 推し友申請', body: `${me.rows[0].display_name}さんから申請が届きました`, url: '/friends' });
  res.status(201).json({ ok: true });
}));

app.post('/api/friends/:id/accept', auth, wrap(async (req, res) => {
  // 承認できるのは申請の受け手のみ
  const f = await pool.query(
    `SELECT * FROM friendships WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
    [req.params.id, req.userId]);
  if (!f.rows.length) return res.status(404).json({ error: '申請が見つかりません' });
  const fr = f.rows[0];
  await pool.query("UPDATE friendships SET status = 'accepted' WHERE id = $1", [fr.id]);

  // 承認時にDM用ルームを自動作成して両者をメンバーに追加
  const room = await pool.query("INSERT INTO chat_rooms (type) VALUES ('dm') RETURNING id");
  const roomId = room.rows[0].id;
  await pool.query('INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2), ($1, $3)',
    [roomId, fr.requester_id, fr.addressee_id]);

  const me = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
  realtime.emitToUser(fr.requester_id, 'friend:accepted', { by: me.rows[0].display_name });
  push.sendToUsers(pool, [fr.requester_id], { title: '🎉 推し友成立', body: `${me.rows[0].display_name}さんと推し友になりました`, url: '/friends' });
  res.json({ ok: true, room_id: roomId });
}));

app.post('/api/friends/:id/reject', auth, wrap(async (req, res) => {
  await pool.query(
    `DELETE FROM friendships WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
    [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// =========================================================
// 他ユーザーのプロフィール閲覧 ＋ ブロック
// =========================================================
// 他ユーザーのプロフィール。非公開ユーザーは推し友以外に詳細（自己紹介・推し）を見せない。
app.get('/api/users/:id/profile', auth, wrap(async (req, res) => {
  const targetId = Number(req.params.id);
  const u = await pool.query('SELECT id, username, display_name, avatar, bio, is_public FROM users WHERE id = $1', [targetId]);
  if (!u.rows.length) return res.status(404).json({ error: '見つかりません' });
  const t = u.rows[0];
  const isSelf = targetId === req.userId;

  const fr = await pool.query(
    `SELECT status, requester_id, addressee_id FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [req.userId, targetId]);
  const friendship = fr.rows[0] || null;
  const isFriend = !!friendship && friendship.status === 'accepted';
  // 自分あての未承認申請かどうか（承認ボタン表示用）
  const pendingIncoming = !!friendship && friendship.status === 'pending' && friendship.addressee_id === req.userId;
  const pendingOutgoing = !!friendship && friendship.status === 'pending' && friendship.requester_id === req.userId;

  const iBlocked = (await pool.query('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.userId, targetId])).rows.length > 0;
  const blockedMe = (await pool.query('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [targetId, req.userId])).rows.length > 0;

  // DMルーム（推し友なら）
  let roomId = null;
  if (isFriend) {
    const room = await pool.query(
      `SELECT id FROM chat_rooms cr WHERE cr.type = 'dm' AND cr.id IN (
         SELECT room_id FROM chat_room_members WHERE user_id = $1
         INTERSECT SELECT room_id FROM chat_room_members WHERE user_id = $2) LIMIT 1`,
      [req.userId, targetId]);
    roomId = room.rows.length ? room.rows[0].id : null;
  }

  // 詳細（自己紹介・推し一覧）を見せてよいか：本人／推し友／公開アカウントのみ
  const canSeeDetail = isSelf || isFriend || (t.is_public && !blockedMe);
  let oshi = [];
  if (canSeeDetail) {
    const o = await pool.query(
      `SELECT m.id AS oshi_master_id, o.name, o.color, m.genre,
              COALESCE(m.image_url, o.image) AS image
       FROM oshi o LEFT JOIN oshi_master m ON m.id = o.oshi_master_id
       WHERE o.user_id = $1 ORDER BY o.id`, [targetId]);
    oshi = o.rows;
  }

  res.json({
    id: t.id, username: t.username, display_name: t.display_name, avatar: t.avatar,
    bio: canSeeDetail ? t.bio : null, is_public: t.is_public,
    is_self: isSelf, is_friend: isFriend, pending_incoming: pendingIncoming, pending_outgoing: pendingOutgoing,
    i_blocked: iBlocked, blocked_me: blockedMe, can_see_detail: canSeeDetail,
    room_id: roomId, oshi,
    incoming_friendship_id: pendingIncoming ? (await pool.query(
      `SELECT id FROM friendships WHERE requester_id = $1 AND addressee_id = $2 AND status='pending'`, [targetId, req.userId])).rows[0]?.id : null,
  });
}));

// ブロックする：以降の申請・DMを遮断し、既存の推し友関係・保留申請は解消する（判定はサーバー側）
app.post('/api/users/:id/block', auth, wrap(async (req, res) => {
  const targetId = Number(req.params.id);
  if (!targetId || targetId === req.userId) return res.status(400).json({ error: '相手が不正です' });
  await pool.query(
    'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, targetId]);
  // 既存の推し友関係・保留中の申請を双方向で解消
  await pool.query(
    `DELETE FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [req.userId, targetId]);
  res.json({ ok: true });
}));

app.post('/api/users/:id/unblock', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.userId, Number(req.params.id)]);
  res.json({ ok: true });
}));

// =========================================================
// チャット（DM・イベント共通）
// =========================================================
app.get('/api/chat/rooms', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT r.id, r.type, r.event_id,
            CASE WHEN r.type = 'event' THEN e.name
                 ELSE (SELECT u2.display_name FROM chat_room_members m2 JOIN users u2 ON u2.id = m2.user_id
                       WHERE m2.room_id = r.id AND m2.user_id <> $1 LIMIT 1) END AS title,
            (SELECT u2.id FROM chat_room_members m2 JOIN users u2 ON u2.id = m2.user_id
             WHERE m2.room_id = r.id AND m2.user_id <> $1 LIMIT 1) AS other_user_id,
            (SELECT u2.avatar FROM chat_room_members m2 JOIN users u2 ON u2.id = m2.user_id
             WHERE m2.room_id = r.id AND m2.user_id <> $1 LIMIT 1) AS other_user_avatar,
            (SELECT content FROM chat_messages cm WHERE cm.room_id = r.id ORDER BY id DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM chat_messages cm WHERE cm.room_id = r.id ORDER BY id DESC LIMIT 1) AS last_at,
            (SELECT COUNT(*)::int FROM chat_room_members WHERE room_id = r.id) AS member_count,
            (SELECT COUNT(*)::int FROM chat_messages cm2
               WHERE cm2.room_id = r.id AND cm2.sender_id <> $1
                 AND NOT EXISTS (SELECT 1 FROM chat_message_reads rr WHERE rr.message_id = cm2.id AND rr.user_id = $1)) AS unread_count,
            EXISTS (SELECT 1 FROM pinned_chats pc WHERE pc.room_id = r.id AND pc.user_id = $1) AS pinned
     FROM chat_rooms r
     JOIN chat_room_members m ON m.room_id = r.id AND m.user_id = $1
     LEFT JOIN events e ON e.id = r.event_id
     ORDER BY pinned DESC, last_at DESC NULLS LAST, r.id DESC`, [req.userId]);
  res.json(r.rows);
}));

// トークのピン止め（メンバーのみ）。一覧の最上部にまとめて表示される
app.post('/api/chat/rooms/:id/pin', auth, wrap(async (req, res) => {
  const roomId = Number(req.params.id);
  const mem = await pool.query('SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.userId]);
  if (!mem.rows.length) return res.status(403).json({ error: 'アクセスできません' });
  await pool.query('INSERT INTO pinned_chats (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, roomId]);
  res.json({ ok: true, pinned: true });
}));

app.delete('/api/chat/rooms/:id/pin', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM pinned_chats WHERE user_id = $1 AND room_id = $2', [req.userId, Number(req.params.id)]);
  res.json({ ok: true, pinned: false });
}));

// トークルームのメンバー一覧（メンバーのみ取得可）。各アイコンからプロフィールへ遷移するのに使う
app.get('/api/chat/rooms/:id/members', auth, wrap(async (req, res) => {
  const roomId = Number(req.params.id);
  const mem = await pool.query('SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.userId]);
  if (!mem.rows.length) return res.status(403).json({ error: 'アクセスできません' });
  const r = await pool.query(
    `SELECT u.id, u.display_name, u.avatar FROM chat_room_members m
     JOIN users u ON u.id = m.user_id WHERE m.room_id = $1 ORDER BY u.display_name`, [roomId]);
  res.json(r.rows);
}));

app.get('/api/chat/rooms/:id/messages', auth, wrap(async (req, res) => {
  const roomId = req.params.id;
  const mem = await pool.query('SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.userId]);
  if (!mem.rows.length) return res.status(403).json({ error: 'このトークにアクセスできません' });
  const r = await pool.query(
    `SELECT cm.*, u.display_name AS sender_name, u.avatar AS sender_avatar,
            (SELECT COUNT(*)::int FROM chat_message_reads rr WHERE rr.message_id = cm.id AND rr.user_id <> cm.sender_id) AS read_count
     FROM chat_messages cm JOIN users u ON u.id = cm.sender_id
     WHERE cm.room_id = $1 ORDER BY cm.id ASC LIMIT 200`, [roomId]);
  res.json(r.rows);
}));

// =========================================================
// 共有アルバム（チャットルーム単位。メンバーのみ閲覧・追加できる）
// =========================================================
async function assertRoomMember(roomId, userId) {
  const mem = await pool.query('SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
  return mem.rows.length > 0;
}

app.get('/api/chat/rooms/:id/album', auth, wrap(async (req, res) => {
  const roomId = Number(req.params.id);
  if (!(await assertRoomMember(roomId, req.userId))) return res.status(403).json({ error: 'このアルバムにアクセスできません' });
  const r = await pool.query(
    `SELECT a.id, a.image_url, a.created_at, a.uploaded_by, u.display_name AS uploader_name
     FROM album_photos a LEFT JOIN users u ON u.id = a.uploaded_by
     WHERE a.room_id = $1 ORDER BY a.id DESC`, [roomId]);
  res.json(r.rows);
}));

app.post('/api/chat/rooms/:id/album', auth, wrap(async (req, res) => {
  const roomId = Number(req.params.id);
  if (!(await assertRoomMember(roomId, req.userId))) return res.status(403).json({ error: 'このアルバムにアクセスできません' });
  const image = req.body.image_url || req.body.image;
  if (!image) return res.status(400).json({ error: '画像を選んでください' });
  const r = await pool.query(
    `INSERT INTO album_photos (room_id, uploaded_by, image_url) VALUES ($1, $2, $3) RETURNING id, image_url, created_at, uploaded_by`,
    [roomId, req.userId, image]);
  const me = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
  const photo = { ...r.rows[0], uploader_name: me.rows[0].display_name };
  realtime.emitToRoom(roomId, 'album:new', { roomId, photo });
  res.status(201).json(photo);
}));

app.delete('/api/chat/rooms/:id/album/:photoId', auth, wrap(async (req, res) => {
  const roomId = Number(req.params.id);
  if (!(await assertRoomMember(roomId, req.userId))) return res.status(403).json({ error: 'アクセスできません' });
  // 投稿者本人のみ削除可
  await pool.query('DELETE FROM album_photos WHERE id = $1 AND room_id = $2 AND uploaded_by = $3',
    [req.params.photoId, roomId, req.userId]);
  res.json({ ok: true });
}));

// =========================================================
// 共通イベント（閲覧・参加は全員、作成・編集・削除は管理者のみ）
// =========================================================
app.get('/api/events', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT e.*, m.name AS artist_name,
            v.name AS venue_name, v.address AS venue_address,
            v.latitude AS venue_lat, v.longitude AS venue_lng,
            v.nearest_station AS venue_station, v.fare_note AS venue_fare_note,
            (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id) AS participant_count,
            EXISTS (SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id AND ep.user_id = $1) AS joined,
            (SELECT savings_goal FROM event_participants ep WHERE ep.event_id = e.id AND ep.user_id = $1) AS savings_goal,
            COALESCE((SELECT SUM(CASE WHEN st.type = 'deposit' THEN st.amount ELSE -st.amount END)::int
                      FROM savings_transactions st
                      JOIN event_participants ep2 ON ep2.id = st.event_participant_id
                      WHERE ep2.event_id = e.id AND ep2.user_id = $1), 0) AS saved_amount,
            (SELECT id FROM chat_rooms cr WHERE cr.type = 'event' AND cr.event_id = e.id LIMIT 1) AS room_id
     FROM events e
     LEFT JOIN oshi_master m ON m.id = e.artist_id
     LEFT JOIN venues v ON v.id = e.venue_id
     ORDER BY e.event_date`, [req.userId]);
  res.json(r.rows);
}));

// 貯金残高の唯一の算出元。参加者本人の event_participant・目標額・残高（入金合計−出金合計）を返す。
// ※ 参戦記録（支出）とは完全に別。将来AI等に「現在の貯金額」を渡す場合も必ずこれを使うこと。
async function getSavings(eventId, userId) {
  const p = await pool.query(
    'SELECT id, savings_goal FROM event_participants WHERE event_id = $1 AND user_id = $2', [eventId, userId]);
  if (!p.rows.length) return null;
  const epId = p.rows[0].id;
  const bal = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END), 0)::int AS balance
     FROM savings_transactions WHERE event_participant_id = $1`, [epId]);
  return { event_participant_id: epId, savings_goal: p.rows[0].savings_goal, balance: bal.rows[0].balance };
}

// 参加予定イベントの貯金目標額を設定（参加者本人のみ）
app.put('/api/events/:id/savings', auth, wrap(async (req, res) => {
  const eventId = Number(req.params.id);
  const goal = req.body.savings_goal;
  const value = goal == null || goal === '' ? null : Math.max(0, Number(goal) || 0);
  const r = await pool.query(
    `UPDATE event_participants SET savings_goal = $1 WHERE event_id = $2 AND user_id = $3 RETURNING savings_goal`,
    [value, eventId, req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: 'このイベントに参加していません' });
  res.json({ ok: true, savings_goal: r.rows[0].savings_goal });
}));

// 貯金の状態（目標・残高・入出金履歴）を取得
app.get('/api/events/:id/savings', auth, wrap(async (req, res) => {
  const s = await getSavings(Number(req.params.id), req.userId);
  if (!s) return res.status(404).json({ error: 'このイベントに参加していません' });
  const tx = await pool.query(
    `SELECT id, amount, type, memo, created_at FROM savings_transactions
     WHERE event_participant_id = $1 ORDER BY id DESC`, [s.event_participant_id]);
  res.json({ savings_goal: s.savings_goal, balance: s.balance, transactions: tx.rows });
}));

// 貯金の入金／出金。出金は残高を超えられない（目標未達でもいつでも引き出せる）
app.post('/api/events/:id/savings/transactions', auth, wrap(async (req, res) => {
  const s = await getSavings(Number(req.params.id), req.userId);
  if (!s) return res.status(404).json({ error: 'このイベントに参加していません' });
  const type = req.body.type === 'withdrawal' ? 'withdrawal' : 'deposit';
  const amount = Math.floor(Number(req.body.amount));
  const memo = req.body.memo ? String(req.body.memo).slice(0, 100) : null;
  if (!amount || amount <= 0) return res.status(400).json({ error: '金額を正しく入力してください' });
  if (type === 'withdrawal' && amount > s.balance) {
    return res.status(400).json({ error: '貯金残高を超える金額は引き出せません' });
  }
  await pool.query(
    'INSERT INTO savings_transactions (event_participant_id, amount, type, memo) VALUES ($1, $2, $3, $4)',
    [s.event_participant_id, amount, type, memo]);
  const s2 = await getSavings(Number(req.params.id), req.userId);
  res.status(201).json({ ok: true, balance: s2.balance, savings_goal: s2.savings_goal });
}));

// 貯金サポートAIに相談する。現在の貯金額は「貯金残高（getSavings）」を渡す（参戦記録の合計は使わない）。
app.get('/api/ai/status', auth, wrap(async (req, res) => {
  res.json({ enabled: true, ai: ai.isConfigured(), remaining: ai.remaining(req.userId), daily_limit: ai.DAILY_LIMIT });
}));

// サイト案内AI（全ログインユーザーが利用可・質問回数の制限なし）
app.post('/api/assistant/site', auth, wrap(async (req, res) => {
  const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
  const result = await ai.siteAssistant(messages);
  res.json(result);
}));

app.post('/api/events/:id/savings/ai', auth, wrap(async (req, res) => {
  const eventId = Number(req.params.id);
  const s = await getSavings(eventId, req.userId);
  if (!s) return res.status(404).json({ error: 'このイベントに参加していません' });
  const ev = await pool.query('SELECT name, event_date FROM events WHERE id = $1', [eventId]);
  if (!ev.rows.length) return res.status(404).json({ error: 'イベントが見つかりません' });
  // イベントまでの残り日数（DATEは 'YYYY-MM-DD' 文字列）
  const target = new Date(ev.rows[0].event_date + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((target - now) / 86400000);
  const result = await ai.savingsAdvice(req.userId, {
    goal: s.savings_goal, balance: s.balance, daysLeft,
    eventName: ev.rows[0].name, userMessage: req.body.message,
  });
  res.json(result);
}));

// イベント履歴：自分が参加した「過去の」イベントを新しい順に。参戦記録・日記の件数も返す
app.get('/api/events/history', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT e.*, m.name AS artist_name,
            COALESCE((SELECT SUM(rec.amount)::int FROM records rec WHERE rec.event_id = e.id AND rec.user_id = $1), 0) AS spent_amount,
            (SELECT COUNT(*)::int FROM records rec WHERE rec.event_id = e.id AND rec.user_id = $1) AS record_count,
            (SELECT COUNT(*)::int FROM diary_entries d WHERE d.related_event_id = e.id AND d.user_id = $1) AS diary_count
     FROM events e
     JOIN event_participants ep ON ep.event_id = e.id AND ep.user_id = $1
     LEFT JOIN oshi_master m ON m.id = e.artist_id
     WHERE e.event_date < CURRENT_DATE
     ORDER BY e.event_date DESC`, [req.userId]);
  res.json(r.rows);
}));

// あるイベントに紐づく自分の参戦記録・日記
app.get('/api/events/:id/mylog', auth, wrap(async (req, res) => {
  const eventId = Number(req.params.id);
  const records = await pool.query(
    `SELECT r.*, o.name AS oshi_name, o.color AS oshi_color
     FROM records r LEFT JOIN oshi o ON o.id = r.oshi_id
     WHERE r.event_id = $1 AND r.user_id = $2 ORDER BY r.record_date`, [eventId, req.userId]);
  const diaries = await pool.query(
    `SELECT id, entry_date, title, content, visibility FROM diary_entries
     WHERE related_event_id = $1 AND user_id = $2 ORDER BY entry_date`, [eventId, req.userId]);
  res.json({ records: records.rows, diaries: diaries.rows });
}));

app.post('/api/events', auth, admin, wrap(async (req, res) => {
  const { name, artist_id, event_date, location, description, image, venue_id } = req.body;
  if (!name || !event_date) return res.status(400).json({ error: 'イベント名と日付は必須です' });
  const r = await pool.query(
    `INSERT INTO events (name, artist_id, event_date, location, description, image, venue_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [name, artist_id || null, event_date, location || null, description || null, image || null, venue_id || null, req.userId]);
  const ev = r.rows[0];
  // 第8弾：そのアーティストを推し登録している全ユーザーへ新規イベントを通知。
  // artist_id未設定のイベントは対象者を特定できないため送らない。
  if (ev.artist_id) {
    const m = await pool.query('SELECT name FROM oshi_master WHERE id = $1', [ev.artist_id]);
    const targets = await pool.query(
      'SELECT DISTINCT user_id FROM oshi WHERE oshi_master_id = $1', [ev.artist_id]);
    if (m.rows.length && targets.rows.length) {
      push.sendToUsers(pool, targets.rows.map((t) => t.user_id), {
        title: '🎪 新しいイベント',
        body: `${m.rows[0].name}の新しいイベント「${ev.name}」が追加されました`,
        url: `/events?focus=${ev.id}`,
      });
      console.log(`イベント追加通知: event_id=${ev.id} 対象${targets.rows.length}人`);
    }
  }
  res.status(201).json(ev);
}));

app.put('/api/events/:id', auth, admin, wrap(async (req, res) => {
  const { name, artist_id, event_date, location, description, image, venue_id } = req.body;
  const r = await pool.query(
    `UPDATE events SET name = $1, artist_id = $2, event_date = $3, location = $4, description = $5, image = $6, venue_id = $7
     WHERE id = $8 RETURNING *`,
    [name, artist_id || null, event_date, location || null, description || null, image || null, venue_id || null, req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
}));

// 会場→最寄り駅の公共交通ルート（Google Routes API, travelMode: TRANSIT）。
// 運賃は日本の鉄道でGoogle側の精度が不安定なため自動取得しない（fare_note＝管理者の任意メモを別途表示）。
// APIキー未設定・最寄り駅未入力・会場未設定などの場合は enabled:false を返して画面側で非表示にする。
app.get('/api/events/:id/route', auth, wrap(async (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const q = await pool.query(
    `SELECT v.latitude, v.longitude, v.nearest_station
     FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.id = $1`, [req.params.id]);
  if (!q.rows.length) return res.json({ enabled: false, reason: 'no_venue' });
  const v = q.rows[0];
  if (!v.nearest_station) return res.json({ enabled: false, reason: 'no_station' });
  if (!key) return res.json({ enabled: false, reason: 'no_key' });
  try {
    const body = {
      origin: { location: { latLng: { latitude: v.latitude, longitude: v.longitude } } },
      destination: { address: v.nearest_station },
      travelMode: 'TRANSIT',
      languageCode: 'ja-JP',
    };
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      console.error('Routes APIエラー:', r.status, await r.text());
      return res.json({ enabled: false, reason: 'api_error' });
    }
    const data = await r.json();
    const route = data.routes && data.routes[0];
    if (!route) return res.json({ enabled: true, found: false, station: v.nearest_station });
    const seconds = route.duration ? parseInt(route.duration, 10) : null; // 例 "600s"
    res.json({
      enabled: true, found: true, station: v.nearest_station,
      duration_min: Number.isFinite(seconds) ? Math.round(seconds / 60) : null,
      distance_m: route.distanceMeters || null,
    });
  } catch (err) {
    console.error(err);
    res.json({ enabled: false, reason: 'exception' });
  }
}));

app.delete('/api/events/:id', auth, admin, wrap(async (req, res) => {
  await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// イベント参加：参加者登録＋個人スケジュールへ追加＋イベントチャットへ参加
app.post('/api/events/:id/join', auth, wrap(async (req, res) => {
  const eventId = Number(req.params.id);
  const ev = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
  if (!ev.rows.length) return res.status(404).json({ error: 'イベントが見つかりません' });
  const event = ev.rows[0];

  const dup = await pool.query('SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2', [eventId, req.userId]);
  if (dup.rows.length) return res.status(409).json({ error: 'すでに参加しています' });

  await pool.query('INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2)', [eventId, req.userId]);

  // 個人スケジュールにも予定として追加（event_idで紐付け）
  await pool.query(
    `INSERT INTO schedules (user_id, title, event_type, event_date, memo, event_id)
     VALUES ($1, $2, 'イベント', $3, $4, $5)`,
    [req.userId, event.name, event.event_date, event.location || null, eventId]);

  // イベント用チャットルームを取得または作成し、メンバーに追加
  let room = await pool.query("SELECT id FROM chat_rooms WHERE type = 'event' AND event_id = $1", [eventId]);
  let roomId;
  if (room.rows.length) roomId = room.rows[0].id;
  else roomId = (await pool.query("INSERT INTO chat_rooms (type, event_id) VALUES ('event', $1) RETURNING id", [eventId])).rows[0].id;
  await pool.query(
    'INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [roomId, req.userId]);

  res.json({ ok: true, room_id: roomId });
}));

app.post('/api/events/:id/leave', auth, wrap(async (req, res) => {
  const eventId = Number(req.params.id);
  await pool.query('DELETE FROM event_participants WHERE event_id = $1 AND user_id = $2', [eventId, req.userId]);
  await pool.query('DELETE FROM schedules WHERE event_id = $1 AND user_id = $2', [eventId, req.userId]);
  const room = await pool.query("SELECT id FROM chat_rooms WHERE type = 'event' AND event_id = $1", [eventId]);
  if (room.rows.length) {
    await pool.query('DELETE FROM chat_room_members WHERE room_id = $1 AND user_id = $2', [room.rows[0].id, req.userId]);
  }
  res.json({ ok: true });
}));

// =========================================================
// 管理者向け：イベント一覧＋参加者数
// =========================================================
app.get('/api/admin/events', auth, admin, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT e.*, m.name AS artist_name, v.name AS venue_name,
            (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id) AS participant_count
     FROM events e
     LEFT JOIN oshi_master m ON m.id = e.artist_id
     LEFT JOIN venues v ON v.id = e.venue_id
     ORDER BY e.event_date`);
  res.json(r.rows);
}));

// =========================================================
// 会場（venue）マスター：登録・編集・削除は管理者のみ（判定はサーバー側）
// =========================================================
// 会場登録・編集フォームの入力を検証して正規化する。最寄り駅・運賃メモは任意。
function parseVenueBody(body) {
  const name = (body.name || '').trim();
  const address = (body.address || '').trim();
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const nearest = body.nearest_station && String(body.nearest_station).trim() ? String(body.nearest_station).trim() : null;
  const fare = body.fare_note && String(body.fare_note).trim() ? String(body.fare_note).trim() : null;
  return { name, address, latitude, longitude, nearest, fare };
}
function validVenue(v) {
  if (!v.name || !v.address) return 'venue_name_address';
  if (!Number.isFinite(v.latitude) || !Number.isFinite(v.longitude)) return 'venue_latlng';
  if (v.latitude < -90 || v.latitude > 90 || v.longitude < -180 || v.longitude > 180) return 'venue_latlng';
  return null;
}

app.get('/api/admin/venues', auth, admin, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT v.*, (SELECT COUNT(*)::int FROM events e WHERE e.venue_id = v.id) AS event_count
     FROM venues v ORDER BY v.id DESC`);
  res.json(r.rows);
}));

app.post('/api/admin/venues', auth, admin, wrap(async (req, res) => {
  const v = parseVenueBody(req.body);
  const err = validVenue(v);
  if (err === 'venue_name_address') return res.status(400).json({ error: '会場名と住所は必須です' });
  if (err === 'venue_latlng') return res.status(400).json({ error: '緯度・経度を正しく入力してください' });
  const r = await pool.query(
    `INSERT INTO venues (name, address, latitude, longitude, nearest_station, fare_note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [v.name, v.address, v.latitude, v.longitude, v.nearest, v.fare, req.userId]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/admin/venues/:id', auth, admin, wrap(async (req, res) => {
  const v = parseVenueBody(req.body);
  const err = validVenue(v);
  if (err === 'venue_name_address') return res.status(400).json({ error: '会場名と住所は必須です' });
  if (err === 'venue_latlng') return res.status(400).json({ error: '緯度・経度を正しく入力してください' });
  const r = await pool.query(
    `UPDATE venues SET name = $1, address = $2, latitude = $3, longitude = $4, nearest_station = $5, fare_note = $6
     WHERE id = $7 RETURNING *`,
    [v.name, v.address, v.latitude, v.longitude, v.nearest, v.fare, req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
}));

app.delete('/api/admin/venues/:id', auth, admin, wrap(async (req, res) => {
  await pool.query('DELETE FROM venues WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// =========================================================
// 日記（個人のオタ活日記帳。公開範囲はつぶやきと共通ロジックを再利用）
// =========================================================
async function fetchEnrichedDiary(id) {
  const r = await pool.query(
    `SELECT d.*, o.name AS oshi_name, o.color AS oshi_color,
            au.display_name AS author_name, au.avatar AS author_avatar,
            e.name AS event_name, re.name AS related_event_name
     FROM diary_entries d
     LEFT JOIN oshi o ON o.id = d.oshi_id
     LEFT JOIN events e ON e.id = d.event_id
     LEFT JOIN events re ON re.id = d.related_event_id
     JOIN users au ON au.id = d.user_id
     WHERE d.id = $1`, [id]);
  return r.rows[0];
}

// 自分の日記帳（本人の全エントリを新しい日付順で）
app.get('/api/diary', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT d.*, o.name AS oshi_name, o.color AS oshi_color, re.name AS related_event_name
     FROM diary_entries d
     LEFT JOIN oshi o ON o.id = d.oshi_id
     LEFT JOIN events re ON re.id = d.related_event_id
     WHERE d.user_id = $1
     ORDER BY d.entry_date DESC, d.id DESC`, [req.userId]);
  res.json(r.rows);
}));

// みんなの公開日記（つぶやきと同じ公開範囲判定を再利用）
app.get('/api/diary/feed', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT d.id, d.entry_date, d.title, d.content, d.visibility, d.created_at,
            o.name AS oshi_name, o.color AS oshi_color, d.user_id AS author_id,
            au.display_name AS author_name, au.avatar AS author_avatar, e.name AS event_name,
            (d.user_id = $1) AS is_own
     FROM diary_entries d
     LEFT JOIN oshi o ON o.id = d.oshi_id
     LEFT JOIN events e ON e.id = d.event_id
     JOIN users au ON au.id = d.user_id
     WHERE d.visibility <> 'private' AND ${visibilityWhere('d')}
     ORDER BY d.id DESC LIMIT 100`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/diary', auth, wrap(async (req, res) => {
  const content = String(req.body.content || '').trim();
  const title = req.body.title ? String(req.body.title).slice(0, 60) : null;
  const entryDate = req.body.entry_date;
  const oshiId = req.body.oshi_id || null;
  const relatedEventId = req.body.related_event_id || null;
  if (!content) return res.status(400).json({ error: '本文を入力してください' });
  if (!entryDate) return res.status(400).json({ error: '日付を選んでください' });

  let resolved;
  try {
    resolved = await resolveVisibility({ userId: req.userId, visibility: req.body.visibility || 'private', oshiId, eventId: req.body.event_id || null });
  } catch (e) { return res.status(e.code || 400).json({ error: e.message }); }

  const ins = await pool.query(
    `INSERT INTO diary_entries (user_id, entry_date, related_event_id, title, content, visibility, event_id, oshi_id, oshi_master_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [req.userId, entryDate, relatedEventId, title, content, resolved.vis, resolved.eventId, oshiId, resolved.oshiMasterId]);
  res.status(201).json(await fetchEnrichedDiary(ins.rows[0].id));
}));

app.put('/api/diary/:id', auth, wrap(async (req, res) => {
  const content = String(req.body.content || '').trim();
  const title = req.body.title ? String(req.body.title).slice(0, 60) : null;
  const entryDate = req.body.entry_date;
  const oshiId = req.body.oshi_id || null;
  const relatedEventId = req.body.related_event_id || null;
  if (!content || !entryDate) return res.status(400).json({ error: '日付と本文は必須です' });

  let resolved;
  try {
    resolved = await resolveVisibility({ userId: req.userId, visibility: req.body.visibility || 'private', oshiId, eventId: req.body.event_id || null });
  } catch (e) { return res.status(e.code || 400).json({ error: e.message }); }

  const r = await pool.query(
    `UPDATE diary_entries SET entry_date = $1, related_event_id = $2, title = $3, content = $4,
            visibility = $5, event_id = $6, oshi_id = $7, oshi_master_id = $8, updated_at = now()
     WHERE id = $9 AND user_id = $10 RETURNING id`,
    [entryDate, relatedEventId, title, content, resolved.vis, resolved.eventId, oshiId, resolved.oshiMasterId, req.params.id, req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(await fetchEnrichedDiary(r.rows[0].id));
}));

app.delete('/api/diary/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM diary_entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// =========================================================
// 推しの着せ替え画像（投稿→管理者承認→ギャラリー）
// =========================================================
// 承認済みギャラリー（そのoshiを登録している人がアイコンに選べる）
app.get('/api/oshi/master/:id/gallery', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT id, image_url, created_at FROM oshi_images
     WHERE oshi_master_id = $1 AND status = 'approved' ORDER BY id DESC`, [req.params.id]);
  res.json(r.rows);
}));

// 推し詳細ページ（表示画像は閲覧者の着せ替え選択を反映・登録人数・公式/グッズURL・承認ギャラリー）
app.get('/api/oshi/master/:id', auth, wrap(async (req, res) => {
  const m = await pool.query(
    `SELECT m.*, (SELECT COUNT(*)::int FROM oshi o WHERE o.oshi_master_id = m.id) AS registered_count,
            EXISTS (SELECT 1 FROM oshi o WHERE o.oshi_master_id = m.id AND o.user_id = $1) AS mine,
            ${displayImageSql('m.id', 'm.image_url')} AS display_image,
            (SELECT ud.oshi_image_id FROM user_oshi_display_image ud
             WHERE ud.user_id = $1 AND ud.oshi_master_id = m.id) AS selected_image_id
     FROM oshi_master m WHERE m.id = $2`, [req.userId, req.params.id]);
  if (!m.rows.length) return res.status(404).json({ error: '見つかりません' });
  const gallery = await pool.query(
    `SELECT id, image_url FROM oshi_images WHERE oshi_master_id = $1 AND status = 'approved' ORDER BY id DESC`, [req.params.id]);
  res.json({ ...m.rows[0], gallery: gallery.rows });
}));

// 着せ替え：この推しの表示画像として承認済み画像を選ぶ（本人の画面だけに反映。null でデフォルトに戻す）
app.put('/api/oshi/master/:id/display-image', auth, wrap(async (req, res) => {
  const masterId = Number(req.params.id);
  const imageId = req.body.oshi_image_id == null ? null : Number(req.body.oshi_image_id);
  if (imageId == null) {
    await pool.query('DELETE FROM user_oshi_display_image WHERE user_id = $1 AND oshi_master_id = $2', [req.userId, masterId]);
    return res.json({ ok: true, selected_image_id: null });
  }
  // 選んだ画像がそのマスターの承認済み画像であることをサーバー側で検証
  const img = await pool.query(
    "SELECT 1 FROM oshi_images WHERE id = $1 AND oshi_master_id = $2 AND status = 'approved'", [imageId, masterId]);
  if (!img.rows.length) return res.status(400).json({ error: '選べる画像ではありません' });
  await pool.query(
    `INSERT INTO user_oshi_display_image (user_id, oshi_master_id, oshi_image_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, oshi_master_id) DO UPDATE SET oshi_image_id = EXCLUDED.oshi_image_id, updated_at = now()`,
    [req.userId, masterId, imageId]);
  res.json({ ok: true, selected_image_id: imageId });
}));

// 着せ替え画像を管理者へ申請（アーティスト＝oshi_masterを選んで送信）
app.post('/api/oshi/images', auth, wrap(async (req, res) => {
  const masterId = Number(req.body.oshi_master_id);
  const image = req.body.image_url || req.body.image;
  if (!masterId || !image) return res.status(400).json({ error: 'アーティストと画像を選んでください' });
  const m = await pool.query('SELECT name FROM oshi_master WHERE id = $1', [masterId]);
  if (!m.rows.length) return res.status(404).json({ error: 'アーティストが見つかりません' });
  await pool.query(
    `INSERT INTO oshi_images (oshi_master_id, submitted_by, image_url, status) VALUES ($1, $2, $3, 'pending')`,
    [masterId, req.userId, image]);
  res.status(201).json({ ok: true });
}));

// =========================================================
// 管理者：着せ替え審査・推しマスター編集（判定は必ずサーバー側）
// =========================================================
app.get('/api/admin/oshi-images', auth, admin, wrap(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const r = await pool.query(
    `SELECT i.id, i.image_url, i.status, i.created_at, i.oshi_master_id,
            m.name AS oshi_name, u.display_name AS submitter_name
     FROM oshi_images i
     JOIN oshi_master m ON m.id = i.oshi_master_id
     LEFT JOIN users u ON u.id = i.submitted_by
     WHERE i.status = $1 ORDER BY i.id DESC`, [status]);
  res.json(r.rows);
}));

app.post('/api/admin/oshi-images/:id/:action', auth, admin, wrap(async (req, res) => {
  const action = req.params.action;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: '不正な操作です' });
  const status = action === 'approve' ? 'approved' : 'rejected';
  // 通知の要否（状態が実際に変わったか）と投稿者を知るため、更新前の行を先に読む
  const cur = await pool.query(
    'SELECT oshi_master_id, image_url, submitted_by, status FROM oshi_images WHERE id = $1', [req.params.id]);
  if (!cur.rows.length) return res.status(404).json({ error: '見つかりません' });
  const img = cur.rows[0];
  await pool.query('UPDATE oshi_images SET status = $1 WHERE id = $2', [status, req.params.id]);
  // 承認時、そのマスターにまだ代表画像がなければ設定する
  if (status === 'approved') {
    await pool.query('UPDATE oshi_master SET image_url = COALESCE(image_url, $1) WHERE id = $2',
      [img.image_url, img.oshi_master_id]);
  }
  // 第8弾：審査結果を投稿者本人へプッシュ通知（同じ状態への再操作では送らない）
  if (img.submitted_by && img.status !== status) {
    const m = await pool.query('SELECT name FROM oshi_master WHERE id = $1', [img.oshi_master_id]);
    const oshiName = m.rows.length ? m.rows[0].name : '推し';
    push.sendToUsers(pool, [img.submitted_by], {
      title: status === 'approved' ? '✅ 着せ替え画像の審査結果' : '🖼️ 着せ替え画像の審査結果',
      body: status === 'approved' ? `${oshiName}の画像が承認されました` : `${oshiName}の画像は却下されました`,
      url: `/oshi/${img.oshi_master_id}`,
    });
  }
  res.json({ ok: true });
}));

// 推しマスターの管理（新規追加・名前/ジャンル/公式URL/グッズURL/代表画像の編集）。
// 情報の正確性と一元管理のため、いずれも管理者のみ（判定はサーバー側）。
app.get('/api/admin/oshi-master', auth, admin, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT m.id, m.name, m.genre, m.image_url, m.official_url, m.goods_url,
            (SELECT COUNT(*)::int FROM oshi o WHERE o.oshi_master_id = m.id) AS registered_count
     FROM oshi_master m ORDER BY registered_count DESC, m.id`);
  res.json(r.rows);
}));

// 推しを新規追加（まだ誰も登録していない推しも管理者が先に登録できる）
app.post('/api/admin/oshi-master', auth, admin, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const genre = String(req.body.genre || 'その他').trim() || 'その他';
  const image_url = req.body.image_url || req.body.image || null;
  const official_url = req.body.official_url || null;
  const goods_url = req.body.goods_url || null;
  if (!name) return res.status(400).json({ error: '推しの名前は必須です' });
  const dup = await pool.query('SELECT 1 FROM oshi_master WHERE name = $1', [name]);
  if (dup.rows.length) return res.status(409).json({ error: '同じ名前の推しがすでに登録されています' });
  const r = await pool.query(
    `INSERT INTO oshi_master (name, genre, image_url, official_url, goods_url)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, genre, image_url, official_url, goods_url]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/admin/oshi-master/:id', auth, admin, wrap(async (req, res) => {
  const { genre, official_url, goods_url, image_url } = req.body;
  const name = req.body.name != null && String(req.body.name).trim() ? String(req.body.name).trim() : null;
  // 名前を変更する場合は他マスターとの重複を防ぐ
  if (name) {
    const dup = await pool.query('SELECT 1 FROM oshi_master WHERE name = $1 AND id <> $2', [name, req.params.id]);
    if (dup.rows.length) return res.status(409).json({ error: '同じ名前の推しがすでに登録されています' });
  }
  // image_url は「指定があれば差し替え、なければ既存を維持」（COALESCEで上書き）
  const r = await pool.query(
    `UPDATE oshi_master SET
        name = COALESCE($1, name),
        genre = COALESCE($2, genre),
        official_url = $3, goods_url = $4,
        image_url = COALESCE($5, image_url)
     WHERE id = $6 RETURNING *`,
    [name, genre || null, official_url || null, goods_url || null, image_url || null, req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
}));

// =========================================================
// Web Push
// =========================================================
app.get('/api/push/vapid', (req, res) => res.json({ publicKey: push.publicKey() }));

app.post('/api/push/subscribe', auth, wrap(async (req, res) => {
  const sub = req.body.subscription;
  if (!sub || !sub.endpoint || !sub.keys) return res.status(400).json({ error: '購読情報が不正です' });
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys) VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`,
    [req.userId, sub.endpoint, sub.keys]);
  res.json({ ok: true });
}));

// =========================================================
// 集計（グラフ用）：推し別の支出合計と直近6か月の月別支出
// =========================================================
app.get('/api/stats/summary', auth, wrap(async (req, res) => {
  const byOshi = await pool.query(
    `SELECT COALESCE(o.name, 'その他') AS name, COALESCE(o.color, '#c8b7a0') AS color,
            SUM(r.amount)::int AS total
     FROM records r LEFT JOIN oshi o ON o.id = r.oshi_id
     WHERE r.user_id = $1
     GROUP BY o.name, o.color ORDER BY total DESC`, [req.userId]);
  const monthly = await pool.query(
    `SELECT to_char(date_trunc('month', r.record_date), 'YYYY-MM') AS month,
            SUM(r.amount)::int AS total
     FROM records r WHERE r.user_id = $1
     GROUP BY 1 ORDER BY 1 DESC LIMIT 6`, [req.userId]);
  res.json({ byOshi: byOshi.rows, monthly: monthly.rows.reverse() });
}));

// 未定義のAPIパスはJSONで404
app.use('/api', (req, res) => res.status(404).json({ error: 'APIが見つかりません' }));

// ---- フロントエンドの静的配信 ----
const distDir = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// ---- 参加予定イベントのリマインド通知（カウントダウン方式） ----
// 2週間前・1週間前に1回ずつ、3日前からは毎日（3日前・2日前・前日・当日）通知する。
// last_reminded_days（最後に通知した残り日数）で同じ段階の二重送信を防ぐ。
const REMINDER_STAGES = [14, 7, 3, 2, 1, 0];

function reminderTitle(daysLeft) {
  if (daysLeft === 0) return '⏰ 本日開催！';
  if (daysLeft === 1) return '⏰ いよいよ明日！';
  if (daysLeft === 7) return '⏰ あと1週間';
  if (daysLeft === 14) return '⏰ あと2週間';
  return `⏰ あと${daysLeft}日`;
}

async function sendEventReminders() {
  if (!push.isConfigured()) return;
  try {
    const rows = await pool.query(
      `SELECT ep.id, ep.user_id, ep.last_reminded_days,
              e.id AS event_id, e.name, e.event_date,
              (e.event_date - CURRENT_DATE)::int AS days_left
       FROM event_participants ep JOIN events e ON e.id = ep.event_id
       WHERE e.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 14`);
    for (const r of rows.rows) {
      if (!REMINDER_STAGES.includes(r.days_left)) continue;
      // この段階（またはより直前の段階）を通知済みならスキップ
      if (r.last_reminded_days !== null && r.last_reminded_days <= r.days_left) continue;
      await push.sendToUsers(pool, [r.user_id], {
        title: reminderTitle(r.days_left),
        body: `${r.name}（${r.event_date}）`,
        url: `/events?focus=${r.event_id}`,
      });
      await pool.query(
        'UPDATE event_participants SET last_reminded_days = $1, reminded = true WHERE id = $2',
        [r.days_left, r.id]);
    }
  } catch (e) {
    console.error('リマインド送信エラー:', e);
  }
}

async function start() {
  for (let i = 1; i <= 10; i++) {
    try { await initDb(); break; }
    catch (err) {
      if (i === 10) throw err;
      console.log(`DB接続待機中... (${i}/10) ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  push.configurePush();
  const server = http.createServer(app);
  realtime.init(server, pool); // Socket.ioを同じHTTPサーバーにアタッチ
  server.listen(PORT, () => console.log(`推しログAPI起動: http://localhost:${PORT}`));

  // 6時間ごとにイベントリマインドをチェック
  sendEventReminders();
  setInterval(sendEventReminders, 6 * 60 * 60 * 1000);
}

start().catch((err) => {
  console.error('起動に失敗しました:', err);
  process.exit(1);
});
