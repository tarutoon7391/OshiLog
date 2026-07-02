// サイト全体のテーマカラー。今の「紙×ワイン」の雰囲気に合わせた、キツすぎない5色。
// Tailwind v4 の @theme 変数（--color-wine など）を実行時に上書きして全体に反映する。
// 紙のベース（背景ベージュ・文字色）は読みやすさのため共通のまま、アクセント色だけ差し替える。
export const THEMES = [
  { key: 'wine', label: 'ワイン', accent: '#8b3a4a', dark: '#6e2c39', tag: '#c8b7a0' },
  { key: 'blue', label: 'スモークブルー', accent: '#5c7a94', dark: '#47617a', tag: '#adbccb' },
  { key: 'green', label: 'セージグリーン', accent: '#5e7a5b', dark: '#4a624a', tag: '#b3c0a6' },
  { key: 'mauve', label: 'モーヴ', accent: '#7d5f8b', dark: '#634a70', tag: '#bfb2cb' },
  { key: 'terracotta', label: 'テラコッタ', accent: '#a86a52', dark: '#8a5540', tag: '#d3b8a2' },
]

const KEY = 'oshilog_theme'

// 選択テーマのアクセント色をCSS変数に反映する（bg-wine / text-wine などが全部変わる）
export function applyTheme(key) {
  const t = THEMES.find((x) => x.key === key) || THEMES[0]
  const s = document.documentElement.style
  s.setProperty('--color-wine', t.accent)
  s.setProperty('--color-wine-dark', t.dark)
  s.setProperty('--color-tag', t.tag)
  // iOS/PWAのステータスバーの帯色（theme-color メタ）もアクセント色に合わせて更新する。
  // これをしないと、いちばん上のステータスバーだけ前の色のまま残る。
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', t.accent)
  return t.key
}

export function getThemeKey() {
  try { return localStorage.getItem(KEY) || 'wine' } catch { return 'wine' }
}

export function setThemeKey(key) {
  try { localStorage.setItem(KEY, key) } catch { /* localStorage不可でも続行 */ }
  return applyTheme(key)
}

// 起動時に保存済みテーマを適用（未選択ならワイン）
export function initTheme() {
  return applyTheme(getThemeKey())
}
