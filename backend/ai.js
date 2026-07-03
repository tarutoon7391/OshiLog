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

// =========================================================
// サイト案内AI（クライアントメニュー用）。「推しログ」について何でも答える。質問回数の制限なし。
// =========================================================
// アプリの全機能を説明したナレッジ。これに基づいて回答させる。
const SITE_KNOWLEDGE = `あなたは推し活記録アプリ「推しログ（OshiLog）」の公式ガイドAIです。
このアプリについて、利用者（特にクライアント＝発注者・レビュー担当）からの質問に、正確で分かりやすい日本語で答えます。

# 推しログとは
- 「推し活（ファンとしての応援活動）」を記録・管理するWebアプリのPWA。デザインは「紙の推し活手帳」がコンセプト（やさしい紙色・ワインレッド系のアクセント。蛍光色は使わない）。
- スマホでの利用を想定。ホーム画面に追加してアプリのように使える（PWA）。

# ログイン・アカウント
- ユーザーID＋パスワードで登録・ログイン。この端末で過去にログインしたIDはクイック選択できる（パスワードは保存しない）。
- 特別なアカウント：管理者（ID: admin）、クライアント（ID: client）、デモ（ID: demo）。
- テーマカラーはプロフィールから5色（ワイン／スモークブルー／セージグリーン／モーヴ／テラコッタ）に変更でき、端末に保存される。

# 画面下部のナビ（フッター）
ホーム／推し／予定／イベント／日記／推し友／つぶやき。管理者だけ「管理」タブ、クライアントだけ「案内（このガイドAI）」タブが追加で表示される。
画面いちばん上で下に引っ張ると、リングが溜まってページが更新される（プルダウン更新）。

# 主な機能
- ホーム：今後の予定、今月の支出、推し別・月別の集計グラフ。
- 推し：推しを登録すると全体で共有される「推しマスター」に紐付く（同名はまとめられ、登録人数が分かる）。推し詳細では登録人数・公式サイト/グッズのURL・着せ替えギャラリーを表示。
- 着せ替え：承認済み画像の中から、その推しの表示画像を自分の画面用に選べる（他人には影響しない）。ユーザーは画像を管理者に申請できる。
- 予定・カレンダー：予定を登録（時間指定も可）。予定は「推し友の中から選んだ相手」にだけ共有できる。
- 参戦記録：ライブ等の支出を記録（後述の貯金とは完全に別物）。
- グッズ：グッズコレクションを画像付き・カテゴリ別に管理。
- イベント：管理者が作った共通イベントに参加できる。参加するとカレンダーに追加され、参加者だけのグループトークに入れる。
- 会場・アクセス：イベントに会場が紐づいていると、地図（Google Maps）で場所を表示し、最寄り駅までの公共交通ルート、運賃メモ（管理者の任意入力）を表示。
- 貯金：イベントごとに貯金（入金・出金）を管理。残高＝入金合計−出金合計で、参戦記録の支出とは無関係。目標額を設定でき、残高を超える引き出しは不可。「貯金サポートAI」に相談もできる（こちらは1日10回まで）。
- 推し友：同じ推しの人をおすすめ表示。申請→承認で推し友になり、DM（トーク）ができる。ブロックも可能（判定はサーバー側）。
- チャット：DM・グループ共通。リアルタイム（既読表示つき）。画像・動画・ファイルを送信でき（送信前に確認）、チャットの画像は共有アルバムに保存できる。改行対応。トークはピン止めできる。
- つぶやき（タイムライン）：短い投稿。公開範囲は「全体」「同じ推しの人」の2種類。削除は投稿者本人のみ。投稿者アイコンをタップするとプロフィールへ。
- 日記：自分だけの日記帳（ページをめくるUI）。公開範囲は非公開・全体・同じ推し・同じイベント参加者から選べ、「みんなの日記」フィードで公開分を読める。
- プロフィール：表示名・アイコン・自己紹介・公開/非公開設定、登録している推し、テーマカラー、通知設定、ログアウト。
- 通知：Web Push（PWA）でメッセージ・友だち申請・イベントリマインドを受け取れる。アプリを開いている間はアプリ内トーストで表示。

# 管理者（ID: admin）ができること
フッターの「管理」タブから：イベントの作成・編集・削除、会場の登録・編集、推しの新規追加・名前/ジャンル/公式URL/グッズURL/代表画像の編集、着せ替え画像の承認・却下。すべて管理者判定はサーバー側で行う。

# 技術構成（聞かれたら）
- フロント：React + Vite + Tailwind、リアルタイムは Socket.io。
- バック：Node.js（Express）＋ PostgreSQL、通知は Web Push、AIは Anthropic の Claude を使用。
- デプロイ：Railway（mainブランチへの反映で自動デプロイ）。`;

async function siteAssistant(messages) {
  if (!isConfigured()) {
    return { reply: '（AI未設定）このガイドAIを使うには、サーバーの環境変数 ANTHROPIC_API_KEY を設定してください。設定すれば、推しログの使い方や機能について何でもお答えできます。', ai: false };
  }
  const system = SITE_KNOWLEDGE + '\n\n# 回答のしかた\n'
    + '- 上記の情報に基づき、推しログの使い方・機能・仕様について丁寧で分かりやすい日本語で答えてください。\n'
    + '- 箇条書きや短い段落で簡潔に。専門用語は噛み砕いて説明してください。\n'
    + '- 情報にない細かい点を聞かれたら、推測で断定せず「その点は把握していません」と正直に伝えてください。\n'
    + '- 推しログと無関係な話題は、丁寧にこのアプリの話へ戻してください。';

  // 会話履歴を整形（user/assistantのみ。先頭はuserから始める必要があるため先頭のassistantは落とす）
  let msgs = (messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-20)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  while (msgs.length && msgs[0].role === 'assistant') msgs.shift();
  if (!msgs.length) return { reply: 'こんにちは！推しログについて、使い方や機能など何でも聞いてください。', ai: true };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages: msgs }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('サイト案内AIエラー:', res.status, t.slice(0, 300));
      return { reply: 'すみません、いまうまく応答できませんでした。少し時間をおいてもう一度お試しください。', ai: false };
    }
    const data = await res.json();
    const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { reply: reply || 'すみません、うまく答えを用意できませんでした。質問を変えてお試しください。', ai: true };
  } catch (e) {
    console.error('サイト案内AI呼び出し失敗:', e.message);
    return { reply: 'すみません、通信に失敗しました。少し時間をおいてもう一度お試しください。', ai: false };
  }
}

module.exports = { isConfigured, savingsAdvice, remaining, DAILY_LIMIT, siteAssistant };
