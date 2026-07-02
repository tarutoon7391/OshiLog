// 認証まわり：パスワードのハッシュ化（scrypt）と署名付きトークン（HMAC）
// パスワードは平文で保存せず、必ずscryptでハッシュ化する。
const crypto = require('crypto');

// トークン署名用の秘密鍵。本番では環境変数 TOKEN_SECRET を必ず設定する
const SECRET = process.env.TOKEN_SECRET || 'oshilog-dev-secret-change-me';

// パスワードをscryptでハッシュ化 → "scrypt$ソルト$ハッシュ" 形式の文字列で返す
function hashPassword(pw) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(pw, salt, 64, (err, dk) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt}$${dk.toString('hex')}`);
    });
  });
}

// 入力パスワードと保存済みハッシュを照合（タイミング攻撃を避けて比較）
function verifyPassword(pw, stored) {
  return new Promise((resolve) => {
    if (!stored || !stored.startsWith('scrypt$')) return resolve(false);
    const [, salt, hash] = stored.split('$');
    crypto.scrypt(pw, salt, 64, (err, dk) => {
      if (err) return resolve(false);
      const a = Buffer.from(hash, 'hex');
      resolve(a.length === dk.length && crypto.timingSafeEqual(a, dk));
    });
  });
}

// ユーザーIDから署名付きトークンを生成（"userId.署名"）
function signToken(userId) {
  const payload = String(userId);
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// トークンを検証して userId を返す（不正ならnull）
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expect);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  const id = Number(payload);
  return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
