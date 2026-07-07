// 通知の一元送信（第15弾）：カテゴリ設定の判定 → 通知センターへの記録 → Web Push送信 → バッジ即時更新。
// これまで push.sendToUsers を直接呼んでいた全ての通知はこのモジュールを通す。
// カテゴリがオフのユーザーには「Push送信」「通知センターへの記録」の両方をスキップする（履歴にも残さない）。
const push = require('./push');

// カテゴリ → users テーブルの設定カラムの対応。
// category 未指定(null)の通知（着せ替え審査結果・推しの新規イベント・予定の個別リマインド）は
// オン/オフ設定の対象外＝常に送る。
const CATEGORY_COLUMNS = {
  friend_request: 'notify_friend_request', // 推し友申請・承認
  chat_dm: 'notify_chat_dm',               // 推し友とのDM
  chat_group: 'notify_chat_group',         // イベントのグループトーク
  event: 'notify_event',                   // イベントリマインド（多段階）
};

// userIds のうち、そのカテゴリの通知をオンにしているユーザーだけに絞り込む
async function filterByCategory(pool, userIds, category) {
  const col = CATEGORY_COLUMNS[category];
  if (!col) return userIds;
  const r = await pool.query(`SELECT id FROM users WHERE id = ANY($1) AND ${col} = true`, [userIds]);
  return r.rows.map((x) => x.id);
}

// 通知を送る。payload = { title, body, url } / opts = { type, category }
async function send(pool, userIds, payload, { type = 'other', category = null } = {}) {
  try {
    const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return;
    const targets = category ? await filterByCategory(pool, ids, category) : ids;
    if (!targets.length) return;

    // 通知センターへ記録（未読で作成）
    for (const uid of targets) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, title, body, link_url) VALUES ($1, $2, $3, $4, $5)',
        [uid, type, payload.title, payload.body || null, payload.url || null]);
    }

    // ベルの未読バッジを即時更新するSocket配信。
    // realtime は起動時にこのモジュールを参照するため、循環requireを避けて遅延requireする
    try {
      const realtime = require('./realtime');
      targets.forEach((uid) => realtime.emitToUser(uid, 'notification:new', {}));
    } catch { /* Socket未初期化でも通知自体は成立させる */ }

    // Web Push（購読のないユーザーへは push 側で自動的にスキップされる）
    await push.sendToUsers(pool, targets, payload);
  } catch (e) {
    console.error('通知送信エラー:', e);
  }
}

module.exports = { send };
