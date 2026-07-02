// 画面共通の定数・関数

export const OSHI_GENRES = ['アイドル', '声優', 'VTuber', 'アーティスト', 'スポーツ選手', 'その他']

// 推しカラー（手帳になじむ落ち着いた色。蛍光色は使わない）
export const OSHI_COLORS = ['#8b3a4a', '#a86b4c', '#c99a3f', '#5e7a5b', '#4a6d7c', '#6b5b7b', '#a75265', '#77694f']

export const EVENT_TYPES = ['ライブ', '配信', 'イベント', 'グッズ発売', '誕生日', 'その他']

export const EVENT_ICONS = {
  'ライブ': '🎤', '配信': '📱', 'イベント': '🎪',
  'グッズ発売': '🛍️', '誕生日': '🎂', 'その他': '📌',
}

export const GOODS_CATEGORIES = ['アクスタ', 'CD・DVD', 'Tシャツ', 'タオル', 'ペンライト', '缶バッジ', 'ぬいぐるみ', 'その他']

// つぶやきの公開範囲
export const VISIBILITIES = [
  { key: 'private', label: 'プライベート', icon: '🔒', hint: '自分だけ' },
  { key: 'public_all', label: '全体に公開', icon: '🌏', hint: '全ユーザー' },
  { key: 'public_same_oshi', label: '同じ推しの人', icon: '💗', hint: '同じ推しを登録している人' },
  { key: 'public_same_event', label: '同じイベント参加者', icon: '🎪', hint: '同じイベントに参加した人' },
]
export const VISIBILITY_MAP = Object.fromEntries(VISIBILITIES.map((v) => [v.key, v]))

// つぶやきで選べる公開範囲は2種類のみ（プライベート＝日記、同じイベント＝イベントチャットで代替）。
// ※ 日記は引き続き VISIBILITIES（4段階）を使う。
export const POST_VISIBILITIES = VISIBILITIES.filter((v) => v.key === 'public_all' || v.key === 'public_same_oshi')

export function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.round((target - today) / 86400000)
}

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function currentMonth() { return todayStr().slice(0, 7) }

export function formatDateJa(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const week = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${week})`
}

export function formatYen(n) { return `${new Intl.NumberFormat('ja-JP').format(n || 0)}円` }

export function shiftMonth(month, diff) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + diff, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 日時を '7/2 18:30' 形式に
export function formatTime(iso) {
  return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// 予定の時刻（'18:30:00' → '18:30'。未指定はnull）
export function formatHm(t) {
  if (!t) return null
  return String(t).slice(0, 5)
}

// ファイルをBase64データURLに変換する共通処理（画像・動画・ファイル添付で再利用）
export function readFileAsDataUrl(file, maxMB = 2) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('ファイルがありません'))
    if (file.size > maxMB * 1024 * 1024) return reject(new Error(`ファイルは${maxMB}MB以下にしてください`))
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('読み込みに失敗しました'))
    reader.readAsDataURL(file)
  })
}

// 添付の種類をMIMEタイプから判定
export function attachmentTypeOf(file) {
  if (!file) return 'file'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'file'
}
