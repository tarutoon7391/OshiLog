// 推しログ バックエンドAPIサーバー
const path = require('path');
const fs = require('fs');
const express = require('express');
const { pool, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// 画像をBase64で送るため上限を広めに取る
app.use(express.json({ limit: '6mb' }));

// 非同期ハンドラのエラーを一括で500に落とすラッパー
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  });

// ---- 簡易認証（プロトタイプ用） ----
// ユーザー名だけでログインし、以降はx-user-idヘッダーで本人を識別するダミー認証
app.post('/api/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!username) return res.status(400).json({ error: 'ユーザー名を入力してください' });
  if (username.length > 20) return res.status(400).json({ error: 'ユーザー名は20文字以内にしてください' });
  const found = await pool.query('SELECT id, username FROM users WHERE username = $1', [username]);
  if (found.rows.length) return res.json(found.rows[0]);
  const created = await pool.query(
    'INSERT INTO users (username) VALUES ($1) RETURNING id, username', [username]);
  res.json(created.rows[0]);
}));

// ログイン済みチェック（x-user-idヘッダー必須）
const auth = (req, res, next) => {
  const uid = Number(req.header('x-user-id'));
  if (!uid) return res.status(401).json({ error: 'ログインしてください' });
  req.userId = uid;
  next();
};

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- 推し ----
app.get('/api/oshi', auth, wrap(async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM oshi WHERE user_id = $1 ORDER BY id', [req.userId]);
  res.json(r.rows);
}));

app.post('/api/oshi', auth, wrap(async (req, res) => {
  const { name, category, color, image } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: '名前を入力してください' });
  const r = await pool.query(
    `INSERT INTO oshi (user_id, name, category, color, image)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.userId, String(name).trim(), category || 'アイドル', color || '#ec4899', image || null]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/oshi/:id', auth, wrap(async (req, res) => {
  const { name, category, color, image } = req.body;
  const r = await pool.query(
    `UPDATE oshi SET name = $1, category = $2, color = $3, image = $4, updated_at = now()
     WHERE id = $5 AND user_id = $6 RETURNING *`,
    [name, category, color, image || null, req.params.id, req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
}));

app.delete('/api/oshi/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM oshi WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// ---- スケジュール ----
app.get('/api/schedules', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT s.*, o.name AS oshi_name, o.color AS oshi_color
     FROM schedules s LEFT JOIN oshi o ON o.id = s.oshi_id
     WHERE s.user_id = $1 ORDER BY s.event_date, s.id`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/schedules', auth, wrap(async (req, res) => {
  const { oshi_id, title, event_type, event_date, memo } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'タイトルと日付を入力してください' });
  const r = await pool.query(
    `INSERT INTO schedules (user_id, oshi_id, title, event_type, event_date, memo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.userId, oshi_id || null, title, event_type || 'ライブ', event_date, memo || null]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/schedules/:id', auth, wrap(async (req, res) => {
  const { oshi_id, title, event_type, event_date, memo } = req.body;
  const r = await pool.query(
    `UPDATE schedules SET oshi_id = $1, title = $2, event_type = $3, event_date = $4, memo = $5, updated_at = now()
     WHERE id = $6 AND user_id = $7 RETURNING *`,
    [oshi_id || null, title, event_type, event_date, memo || null, req.params.id, req.userId]);
  if (!r.rows.length) return res.status(404).json({ error: '見つかりません' });
  res.json(r.rows[0]);
}));

app.delete('/api/schedules/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM schedules WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// ---- 参戦記録・オタ活家計簿 ----
// ?month=YYYY-MM を付けるとその月だけに絞り込む
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
  const yen = Number(amount) || 0;
  const r = await pool.query(
    `INSERT INTO records (user_id, oshi_id, title, record_date, amount, memo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.userId, oshi_id || null, title, record_date, yen, memo || null]);
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

// ---- グッズコレクション ----
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

// ---- つぶやき ----
app.get('/api/posts', auth, wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT p.*, o.name AS oshi_name, o.color AS oshi_color
     FROM posts p LEFT JOIN oshi o ON o.id = p.oshi_id
     WHERE p.user_id = $1 ORDER BY p.id DESC`, [req.userId]);
  res.json(r.rows);
}));

app.post('/api/posts', auth, wrap(async (req, res) => {
  const { oshi_id, content } = req.body;
  if (!content || !String(content).trim()) return res.status(400).json({ error: '内容を入力してください' });
  if (String(content).length > 300) return res.status(400).json({ error: 'つぶやきは300文字以内にしてください' });
  const r = await pool.query(
    `INSERT INTO posts (user_id, oshi_id, content) VALUES ($1, $2, $3) RETURNING *`,
    [req.userId, oshi_id || null, String(content).trim()]);
  res.status(201).json(r.rows[0]);
}));

app.delete('/api/posts/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM posts WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// ---- 集計（グラフ用） ----
// 推し別の支出合計と、直近6か月の月別支出を返す
app.get('/api/stats/summary', auth, wrap(async (req, res) => {
  const byOshi = await pool.query(
    `SELECT COALESCE(o.name, 'その他') AS name, COALESCE(o.color, '#9ca3af') AS color,
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

// 未定義のAPIパスはJSONで404を返す（SPAフォールバックに流さない）
app.use('/api', (req, res) => res.status(404).json({ error: 'APIが見つかりません' }));

// ---- フロントエンドの静的配信（本番用） ----
const distDir = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPAなのでどのパスでもindex.htmlを返す
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// DBの起動を待ってからサーバーを開始する（Railwayの起動順対策でリトライ）
async function start() {
  for (let i = 1; i <= 10; i++) {
    try {
      await initDb();
      break;
    } catch (err) {
      if (i === 10) throw err;
      console.log(`DB接続待機中... (${i}/10) ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`推しログAPI起動: http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('起動に失敗しました:', err);
  process.exit(1);
});
