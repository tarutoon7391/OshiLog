// Web Push（VAPID方式）でサーバーからプッシュ通知を送る
const webpush = require('web-push');

let configured = false;

// 起動時にVAPIDキーを読み込む。未設定なら通知機能は無効化（アプリの他機能には影響しない）
function configurePush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:oshilog@example.com', pub, priv);
    configured = true;
    console.log('Web Push 設定OK');
  } else {
    console.log('VAPIDキー未設定のためWeb Pushは無効です');
  }
  return configured;
}

function isConfigured() {
  return configured;
}

function publicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

// 指定ユーザー群の全購読先へ通知を送る。期限切れ(410/404)の購読は掃除する
async function sendToUsers(pool, userIds, payload) {
  if (!configured || !userIds || !userIds.length) return;
  const subs = await pool.query(
    'SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = ANY($1)', [userIds]);
  const data = JSON.stringify(payload);
  await Promise.all(subs.rows.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
        console.log(`失効したプッシュ購読を削除: id=${s.id}`);
      } else {
        // 失効以外の失敗（VAPID不整合・ネットワーク等）は原因調査できるようログに残す
        console.error(`プッシュ送信エラー: id=${s.id} status=${err.statusCode || '-'} ${err.message}`);
      }
    }
  }));
}

module.exports = { configurePush, isConfigured, publicKey, sendToUsers };
