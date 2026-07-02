// 貯金サポートAI：Anthropic Messages APIを使い、貯金の進捗に応じた助言・励ましを生成する。
// - APIキーは必ずサーバー側の環境変数 ANTHROPIC_API_KEY で管理し、フロントには一切露出しない。
// - コスト抑制のため軽量モデル（Haiku系）を使用し、1ユーザー1日あたりの呼び出し回数に上限を設ける。
// - キー未設定でもアプリが壊れないよう、ルールベースの応答にフォールバックする。

const MODEL = 'claude-haiku-4-5'; // 軽量モデル
const DAILY_LIMIT = 10;           // 1ユーザーあたり1日10回まで
const API_URL = 'https://api.anthropic.com/v1/messages';

// 呼び出し回数の記録（メモリ内。userId -> { date: 'YYYY-MM-DD', count }）
const usage = new Map();

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 残り回数を返す（消費はしない）
function remaining(userId) {
  const u = usage.get(userId);
  if (!u || u.date !== today()) return DAILY_LIMIT;
  return Math.max(0, DAILY_LIMIT - u.count);
}

function consume(userId) {
  const d = today();
  const u = usage.get(userId);
  if (!u || u.date !== d) usage.set(userId, { date: d, count: 1 });
  else u.count += 1;
}

const yen = (n) => `${Number(n || 0).toLocaleString('ja-JP')}円`;

// キー未設定時のルールベース応答（AIなしでも機能する簡易アドバイス）
function ruleBasedReply({ goal, balance, daysLeft, eventName }) {
  const remain = Math.max(0, (goal || 0) - balance);
  if (!goal) return `${eventName}に向けて貯金を始めましょう！まずは無理のない金額をコツコツ積み立てるのがおすすめです。`;
  if (balance >= goal) return `🎉 目標達成おめでとうございます！${eventName}を思いっきり楽しんでくださいね。当日の交通費や物販の予算も少し見ておくと安心です。`;
  const perDay = daysLeft > 0 ? Math.ceil(remain / daysLeft) : remain;
  const pct = Math.round((balance / goal) * 100);
  return `いまの貯金は${yen(balance)}（目標の${pct}%）。${eventName}まであと${daysLeft > 0 ? daysLeft + '日' : 'わずか'}、残り${yen(remain)}です。`
    + (daysLeft > 0 ? `1日あたり約${yen(perDay)}ずつ貯めれば間に合います。` : '') + ' あと少し、一緒にがんばりましょう！';
}

// 貯金サポートAIの応答を生成する。ctx = { goal, balance, daysLeft, eventName, userMessage }
async function savingsAdvice(userId, ctx) {
  if (remaining(userId) <= 0) {
    return { reply: '本日のAI相談の上限に達しました。また明日ご相談ください🙏', remaining: 0, ai: false, limited: true };
  }

  // キー未設定ならルールベースにフォールバック（回数は消費しない）
  if (!isConfigured()) {
    return { reply: ruleBasedReply(ctx), remaining: remaining(userId), ai: false };
  }

  const remain = Math.max(0, (ctx.goal || 0) - ctx.balance);
  const system = 'あなたは「推しログ」という推し活アプリの、やさしく前向きな貯金サポートAIです。'
    + 'ユーザーがイベントに向けてお金を貯めるのを応援します。紙の推し活手帳のような、あたたかく親しみやすい日本語で、'
    + '2〜4文で簡潔に、具体的なアドバイスと励ましを返してください。絵文字は控えめに。金額の計算は与えられた数値のみを使い、勝手に増やさないこと。';
  const context = `【イベント】${ctx.eventName}\n【目標金額】${ctx.goal ? yen(ctx.goal) : '未設定'}\n`
    + `【現在の貯金額】${yen(ctx.balance)}（入金合計−出金合計で算出。参戦記録の支出とは無関係）\n`
    + `【残り必要額】${yen(remain)}\n【イベントまでの残り日数】${ctx.daysLeft >= 0 ? ctx.daysLeft + '日' : '開催済み'}`;
  const userText = ctx.userMessage && ctx.userMessage.trim()
    ? `${context}\n\n【ユーザーからの相談】${ctx.userMessage.trim()}`
    : `${context}\n\nこの貯金の進み具合について、アドバイスと励ましをください。`;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: userText }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('AI応答エラー:', res.status, t.slice(0, 300));
      // 失敗時はルールベースにフォールバック（回数は消費しない）
      return { reply: ruleBasedReply(ctx), remaining: remaining(userId), ai: false };
    }
    const data = await res.json();
    const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
      || ruleBasedReply(ctx);
    consume(userId);
    return { reply, remaining: remaining(userId), ai: true };
  } catch (e) {
    console.error('AI呼び出し失敗:', e.message);
    return { reply: ruleBasedReply(ctx), remaining: remaining(userId), ai: false };
  }
}

module.exports = { isConfigured, savingsAdvice, remaining, DAILY_LIMIT };
