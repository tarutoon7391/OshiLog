// 推しログ バックエンドAPIサーバー（Express + Socket.io + Web Push）
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { pool, initDb } = require('./db');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./auth');
const push = require('./push');
const realtime = require('./realtime');

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
    'INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, display_name, avatar, bio, is_admin',
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
  const user = { id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, bio: u.bio, is_admin: u.is_admin };
  res.json({ user, token: signToken(user.id) });
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  const r = await pool.query(
    'SELECT id, username, display_name, avatar, bio, is_admin FROM users WHERE id = $1', [req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
}));

app.put('/api/me', auth, wrap(async (req, res) => {
  const { display_name, avatar, bio } = req.body;
  const r = await pool.query(
    `UPDATE users SET display_name = COALESCE($1, display_name), avatar = $2, bio = $3, updated_at = now()
     WHERE id = $4 RETURNING id, username, display_name, avatar, bio, is_admin`,
    [display_name ? String(display_name).slice(0, 20) : null, avatar || null, bio ? String(bio).slice(0, 200) : null, req.userId]);
  res.json(r.rows[0]);
}));

// =========================================================
// 推し（個人登録）＋ 推しマスター（ブラウズ）
// =========================================================
// ジャンルブロック→タイル一覧用。全マスターを登録人数付きで返す
app.get('/api/oshi/browse', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT m.id, m.name, m.genre, m.image_url,
            COUNT(o.id)::int AS registered_count,
            BOOL_OR(o.user_id = $1) AS mine
     FROM oshi_master m
     LEFT JOIN oshi o ON o.oshi_master_id = m.id
     GROUP BY m.id
     ORDER BY registered_count DESC, m.id`, [req.userId]);
  res.json(r.rows);
}));

// 自分が登録している推し
app.get('/api/oshi', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT o.*, m.genre, m.image_url AS master_image,
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
// スケジュール（推し友の共有予定も含めて返す）
// =========================================================
app.get('/api/schedules', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT s.*, o.name AS oshi_name, o.color AS oshi_color, u.display_name AS owner_name,
            (s.user_id = $1) AS is_own
     FROM schedules s
     LEFT JOIN oshi o ON o.id = s.oshi_id
     JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1
        OR (s.is_shared = true AND s.user_id IN (
             SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END
             FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)))
     ORDER BY s.event_date, s.id`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/schedules', auth, wrap(async (req, res) => {
  const { oshi_id, title, event_type, event_date, memo, is_shared } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'タイトルと日付を入力してください' });
  const r = await pool.query(
    `INSERT INTO schedules (user_id, oshi_id, title, event_type, event_date, memo, is_shared)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.userId, oshi_id || null, title, event_type || 'ライブ', event_date, memo || null, !!is_shared]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/schedules/:id', auth, wrap(async (req, res) => {
  const { oshi_id, title, event_type, event_date, memo, is_shared } = req.body;
  const r = await pool.query(
    `UPDATE schedules SET oshi_id = $1, title = $2, event_type = $3, event_date = $4, memo = $5, is_shared = $6, updated_at = now()
     WHERE id = $7 AND user_id = $8 RETURNING *`,
    [oshi_id || null, title, event_type, event_date, memo || null, !!is_shared, req.params.id, req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
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
    `SELECT r.*, o.name AS oshi_name, o.color AS oshi_color
     FROM records r LEFT JOIN oshi o ON o.id = r.oshi_id
     WHERE ${where} ORDER BY r.record_date DESC, r.id DESC`, params);
  res.json(r.rows);
}));

app.post('/api/records', auth, wrap(async (req, res) => {
  const { oshi_id, title, record_date, amount, memo } = req.body;
  if (!title || !record_date) return res.status(400).json({ error: '内容と日付を入力してください' });
  const r = await pool.query(
    `INSERT INTO records (user_id, oshi_id, title, record_date, amount, memo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.userId, oshi_id || null, title, record_date, Number(amount) || 0, memo || null]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/records/:id', auth, wrap(async (req, res) => {
  const { oshi_id, title, record_date, amount, memo } = req.body;
  const r = await pool.query(
    `UPDATE records SET oshi_id = $1, title = $2, record_date = $3, amount = $4, memo = $5, updated_at = now()
     WHERE id = $6 AND user_id = $7 RETURNING *`,
    [oshi_id || null, title, record_date, Number(amount) || 0, memo || null, req.params.id, req.userId]);
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
// つぶやき（公開範囲つき・サーバー側フィルタリング）
// =========================================================
// 投稿を「enrich（推し名・投稿者名を付与）」して1件返す
async function fetchEnrichedPost(id) {
  const r = await pool.query(
    `SELECT p.*, o.name AS oshi_name, o.color AS oshi_color,
            au.display_name AS author_name, au.username AS author_username, au.avatar AS author_avatar,
            e.name AS event_name
     FROM posts p
     LEFT JOIN oshi o ON o.id = p.oshi_id
     LEFT JOIN events e ON e.id = p.event_id
     JOIN users au ON au.id = p.user_id
     WHERE p.id = $1`, [id]);
  return r.rows[0];
}

app.get('/api/posts', auth, wrap(async (req, res) => {
  // 閲覧者の条件（本人／同じ推し／同じイベント）に応じてサーバー側で絞り込む
  const r = await pool.query(
    `SELECT p.*, o.name AS oshi_name, o.color AS oshi_color,
            au.display_name AS author_name, au.username AS author_username, au.avatar AS author_avatar,
            e.name AS event_name
     FROM posts p
     LEFT JOIN oshi o ON o.id = p.oshi_id
     LEFT JOIN events e ON e.id = p.event_id
     JOIN users au ON au.id = p.user_id
     WHERE p.user_id = $1
        OR p.visibility = 'public_all'
        OR (p.visibility = 'public_same_oshi' AND p.oshi_master_id IN (
              SELECT oshi_master_id FROM oshi WHERE user_id = $1 AND oshi_master_id IS NOT NULL))
        OR (p.visibility = 'public_same_event' AND p.event_id IN (
              SELECT event_id FROM event_participants WHERE user_id = $1))
     ORDER BY p.id DESC LIMIT 100`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/posts', auth, wrap(async (req, res) => {
  const content = String(req.body.content || '').trim();
  const oshiId = req.body.oshi_id || null;
  let visibility = String(req.body.visibility || 'public_all');
  const eventId = req.body.event_id || null;
  const allowed = ['private', 'public_all', 'public_same_oshi', 'public_same_event'];
  if (!content) return res.status(400).json({ error: '内容を入力してください' });
  if (content.length > 300) return res.status(400).json({ error: 'つぶやきは300文字以内にしてください' });
  if (!allowed.includes(visibility)) visibility = 'public_all';
  if (visibility === 'public_same_event' && !eventId) {
    return res.status(400).json({ error: 'イベントを選択してください' });
  }

  // 「同じ推し」公開時は、投稿対象の推しからマスターIDを引く
  let oshiMasterId = null;
  if (oshiId) {
    const o = await pool.query('SELECT oshi_master_id FROM oshi WHERE id = $1 AND user_id = $2', [oshiId, req.userId]);
    oshiMasterId = o.rows.length ? o.rows[0].oshi_master_id : null;
  }
  if (visibility === 'public_same_oshi' && !oshiMasterId) {
    return res.status(400).json({ error: '「同じ推し」で公開するには推しを選んでください' });
  }

  const ins = await pool.query(
    `INSERT INTO posts (user_id, oshi_id, content, visibility, event_id, oshi_master_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.userId, oshiId, content, visibility, visibility === 'public_same_event' ? eventId : null, oshiMasterId]);
  const post = await fetchEnrichedPost(ins.rows[0].id);
  realtime.emitNewPost(post); // 公開範囲に応じたルームへリアルタイム配信
  res.status(201).json(post);
}));

app.delete('/api/posts/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM posts WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
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
       AND NOT EXISTS (
         SELECT 1 FROM friendships f
         WHERE (f.requester_id = $1 AND f.addressee_id = u.id)
            OR (f.requester_id = u.id AND f.addressee_id = $1))
     GROUP BY u.id
     ORDER BY random() LIMIT 10`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/friends/request', auth, wrap(async (req, res) => {
  const addressee = Number(req.body.addressee_id);
  if (!addressee || addressee === req.userId) return res.status(400).json({ error: '相手が不正です' });
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
// チャット（DM・イベント共通）
// =========================================================
app.get('/api/chat/rooms', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT r.id, r.type, r.event_id,
            CASE WHEN r.type = 'event' THEN e.name
                 ELSE (SELECT u2.display_name FROM chat_room_members m2 JOIN users u2 ON u2.id = m2.user_id
                       WHERE m2.room_id = r.id AND m2.user_id <> $1 LIMIT 1) END AS title,
            (SELECT content FROM chat_messages cm WHERE cm.room_id = r.id ORDER BY id DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM chat_messages cm WHERE cm.room_id = r.id ORDER BY id DESC LIMIT 1) AS last_at,
            (SELECT COUNT(*)::int FROM chat_room_members WHERE room_id = r.id) AS member_count
     FROM chat_rooms r
     JOIN chat_room_members m ON m.room_id = r.id AND m.user_id = $1
     LEFT JOIN events e ON e.id = r.event_id
     ORDER BY last_at DESC NULLS LAST, r.id DESC`, [req.userId]);
  res.json(r.rows);
}));

app.get('/api/chat/rooms/:id/messages', auth, wrap(async (req, res) => {
  const roomId = req.params.id;
  const mem = await pool.query('SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.userId]);
  if (!mem.rows.length) return res.status(403).json({ error: 'このトークにアクセスできません' });
  const r = await pool.query(
    `SELECT cm.*, u.display_name AS sender_name, u.avatar AS sender_avatar
     FROM chat_messages cm JOIN users u ON u.id = cm.sender_id
     WHERE cm.room_id = $1 ORDER BY cm.id ASC LIMIT 200`, [roomId]);
  res.json(r.rows);
}));

// =========================================================
// 共通イベント（閲覧・参加は全員、作成・編集・削除は管理者のみ）
// =========================================================
app.get('/api/events', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT e.*, m.name AS artist_name,
            (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id) AS participant_count,
            EXISTS (SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id AND ep.user_id = $1) AS joined,
            (SELECT id FROM chat_rooms cr WHERE cr.type = 'event' AND cr.event_id = e.id LIMIT 1) AS room_id
     FROM events e LEFT JOIN oshi_master m ON m.id = e.artist_id
     ORDER BY e.event_date`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/events', auth, admin, wrap(async (req, res) => {
  const { name, artist_id, event_date, location, description, image } = req.body;
  if (!name || !event_date) return res.status(400).json({ error: 'イベント名と日付は必須です' });
  const r = await pool.query(
    `INSERT INTO events (name, artist_id, event_date, location, description, image, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, artist_id || null, event_date, location || null, description || null, image || null, req.userId]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/events/:id', auth, admin, wrap(async (req, res) => {
  const { name, artist_id, event_date, location, description, image } = req.body;
  const r = await pool.query(
    `UPDATE events SET name = $1, artist_id = $2, event_date = $3, location = $4, description = $5, image = $6
     WHERE id = $7 RETURNING *`,
    [name, artist_id || null, event_date, location || null, description || null, image || null, req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
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
    `SELECT e.*, m.name AS artist_name,
            (SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id) AS participant_count
     FROM events e LEFT JOIN oshi_master m ON m.id = e.artist_id
     ORDER BY e.event_date`);
  res.json(r.rows);
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

// ---- 参加予定イベントのリマインド通知（前日・当日を1回だけ送る） ----
async function sendEventReminders() {
  if (!push.isConfigured()) return;
  try {
    const rows = await pool.query(
      `SELECT ep.id, ep.user_id, e.name, e.event_date
       FROM event_participants ep JOIN events e ON e.id = ep.event_id
       WHERE ep.reminded = false AND e.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 1`);
    for (const r of rows.rows) {
      await push.sendToUsers(pool, [r.user_id], {
        title: '⏰ イベントが近づいています',
        body: `${r.name}（${r.event_date}）`,
        url: '/events',
      });
      await pool.query('UPDATE event_participants SET reminded = true WHERE id = $1', [r.id]);
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
