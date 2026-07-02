// 画面共通で使う定数・関数

export const OSHI_CATEGORIES = ['アイドル', '声優', 'アーティスト', 'VTuber', '俳優', 'キャラクター', 'その他']

// 推しカラーのプリセット
export const OSHI_COLORS = ['#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6']

export const EVENT_TYPES = ['ライブ', '配信', 'イベント', 'グッズ発売', '誕生日', 'その他']

export const EVENT_ICONS = {
  'ライブ': '🎤',
  '配信': '📱',
  'イベント': '🎪',
  'グッズ発売': '🛍️',
  '誕生日': '🎂',
  'その他': '📌',
}

export const GOODS_CATEGORIES = ['アクスタ', 'CD・DVD', 'Tシャツ', 'タオル', 'ペンライト', '缶バッジ', 'ぬいぐるみ', 'その他']

// 'YYYY-MM-DD' までの残り日数（今日なら0、過去ならマイナス）
export function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.round((target - today) / 86400000)
}

// 今日の日付を 'YYYY-MM-DD' で返す（フォームの初期値用）
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 今月を 'YYYY-MM' で返す
export function currentMonth() {
  return todayStr().slice(0, 7)
}

// 'YYYY-MM-DD' → '2026年7月2日(木)' 形式
export function formatDateJa(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const week = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${week})`
}

// 金額を '12,345円' 形式に
export function formatYen(n) {
  return `${new Intl.NumberFormat('ja-JP').format(n || 0)}円`
}

// 'YYYY-MM' を前後に動かす（集計画面の月送り用）
export function shiftMonth(month, diff) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + diff, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
