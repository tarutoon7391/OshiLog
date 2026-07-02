// Socket.ioによるリアルタイム基盤
// - チャット（DM・イベント）とつぶやきのリアルタイム反映を同じサーバーで扱う
// - 公開範囲の判定は「どのルームにemitするか」で表現し、タイムライン取得時の判定と揃える
const push = require('./push');

let io = null;
let pool = null;

// ユーザーが接続時に参加すべきルーム一覧を算出する
//  - public_all           : 全員共通（パブリック全体投稿）
//  - user_{id}            : 本人あて（通知・DM着信など）
//  - oshi_{masterId}      : その推しを登録している人（パブリック同じ推し投稿）
//  - event_{eventId}      : そのイベント参加者（パブリック同じイベント投稿／イベントチャット）
//  - room_{roomId}        : 参加中のチャットルーム（DM・イベントチャット）
async function userRooms(userId) {
  const rooms = ['public_all', `user_${userId}`];
  const o = await pool.query(
    'SELECT DISTINCT oshi_master_id FROM oshi WHERE user_id = $1 AND oshi_master_id IS NOT NULL', [userId]);
  o.rows.forEach((r) => rooms.push(`oshi_${r.oshi_master_id}`));
  const e = await pool.query('SELECT event_id FROM event_participants WHERE user_id = $1', [userId]);
  e.rows.forEach((r) => rooms.push(`event_${r.event_id}`));
  const c = await pool.query('SELECT room_id FROM chat_room_members WHERE user_id = $1', [userId]);
  c.rows.forEach((r) => rooms.push(`room_${r.room_id}`));
  return rooms;
}

function init(server, pgPool) {
  const { Server } = require('socket.io');
  const { verifyToken } = require('./auth');
  pool = pgPool;
  io = new Server(server, { cors: { origin: true } });

  // 接続時にトークンで認証する
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const uid = verifyToken(token);
    if (!uid) return next(new Error('unauthorized'));
    socket.userId = uid;
    next();
  });

  io.on('connection', async (socket) => {
    const joinAll = async () => {
      const rooms = await userRooms(socket.userId);
      rooms.forEach((r) => socket.join(r));
    };
    try { await joinAll(); } catch (e) { console.error(e); }

    // 推し登録・イベント参加・推し友承認などの後、クライアントが呼んでルームを追従させる
    socket.on('resync', async () => { try { await joinAll(); } catch (e) { console.error(e); } });

    // チャット送信（DM・イベント共通）。メンバーかどうかを必ずサーバー側で確認する
    // テキストに加え、画像・ファイル・動画の添付（Base64データURL）も送れる
    socket.on('chat:send', async (data, cb) => {
      try {
        const roomId = Number(data && data.roomId);
        const content = String((data && data.content) || '').trim();
        const att = data && data.attachment;
        const attUrl = att && att.url ? String(att.url) : null;
        const attType = att && ['image', 'file', 'video'].includes(att.type) ? att.type : null;
        const attName = att && att.name ? String(att.name).slice(0, 120) : null;
        if (!roomId || (!content && !attUrl)) return cb && cb({ error: '入力が不正です' });
        const mem = await pool.query(
          'SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2', [roomId, socket.userId]);
        if (!mem.rows.length) return cb && cb({ error: 'このトークにアクセスできません' });

        const ins = await pool.query(
          `INSERT INTO chat_messages (room_id, sender_id, content, attachment_url, attachment_type, attachment_name)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [roomId, socket.userId, content.slice(0, 1000), attUrl, attType, attName]);
        const u = await pool.query('SELECT display_name, username, avatar FROM users WHERE id = $1', [socket.userId]);
        const full = {
          ...ins.rows[0],
          sender_name: u.rows[0].display_name || u.rows[0].username,
          sender_avatar: u.rows[0].avatar,
          read_count: 0,
        };
        io.to(`room_${roomId}`).emit('chat:message', full);
        cb && cb({ ok: true, message: full });

        // 同室の他メンバーへプッシュ通知
        const others = await pool.query(
          'SELECT user_id FROM chat_room_members WHERE room_id = $1 AND user_id <> $2', [roomId, socket.userId]);
        const preview = content ? content.slice(0, 80) : (attType === 'image' ? '📷 画像' : attType === 'video' ? '🎬 動画' : '📎 ファイル');
        push.sendToUsers(pool, others.rows.map((r) => r.user_id), {
          title: `💬 ${full.sender_name}`,
          body: preview,
          url: '/friends',
        });
      } catch (e) {
        console.error(e);
        cb && cb({ error: '送信に失敗しました' });
      }
    });

    // 既読：ルーム内の自分以外のメッセージを既読にし、既読状況を送信者側へ配信する
    socket.on('chat:read', async (data, cb) => {
      try {
        const roomId = Number(data && data.roomId);
        if (!roomId) return;
        const mem = await pool.query(
          'SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2', [roomId, socket.userId]);
        if (!mem.rows.length) return;
        // まだ既読でない他人のメッセージを取得
        const unread = await pool.query(
          `SELECT id FROM chat_messages cm
           WHERE cm.room_id = $1 AND cm.sender_id <> $2
             AND NOT EXISTS (SELECT 1 FROM chat_message_reads r WHERE r.message_id = cm.id AND r.user_id = $2)`,
          [roomId, socket.userId]);
        const ids = unread.rows.map((r) => r.id);
        if (!ids.length) return cb && cb({ ok: true, messageIds: [] });
        for (const id of ids) {
          await pool.query(
            'INSERT INTO chat_message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [id, socket.userId]);
        }
        // 送信者側の既読表示を更新するため、既読になったメッセージIDを配信
        io.to(`room_${roomId}`).emit('chat:read', { roomId, readerId: socket.userId, messageIds: ids });
        cb && cb({ ok: true, messageIds: ids });
      } catch (e) {
        console.error(e);
      }
    });
  });

  return io;
}

// 指定ルーム（room_{id}）の全メンバーへイベントを配信（アルバム追加など）
function emitToRoom(roomId, event, data) {
  if (io) io.to(`room_${roomId}`).emit(event, data);
}

// 新規つぶやきを公開範囲に応じたルームへ配信（プライベートは配信しない）
function emitNewPost(post) {
  if (!io) return;
  if (post.visibility === 'public_all') {
    io.to('public_all').emit('post:new', post);
  } else if (post.visibility === 'public_same_oshi' && post.oshi_master_id) {
    io.to(`oshi_${post.oshi_master_id}`).emit('post:new', post);
  } else if (post.visibility === 'public_same_event' && post.event_id) {
    io.to(`event_${post.event_id}`).emit('post:new', post);
  }
}

// 特定ユーザーへイベント通知（推し友申請など）
function emitToUser(userId, event, data) {
  if (io) io.to(`user_${userId}`).emit(event, data);
}

module.exports = { init, emitNewPost, emitToUser, emitToRoom };
