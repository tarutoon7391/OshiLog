// 画面共通の小さなUI部品（紙の手帳デザイン）
import { createPortal } from 'react-dom'

// 推し・ユーザーのアイコン（画像がなければ色＋頭文字）
export function Avatar({ image, name, color = '#8b3a4a', size = 'w-12 h-12', textSize = 'text-lg' }) {
  if (image) {
    return <img src={image} alt={name} className={`${size} rounded-full object-cover shrink-0`} />
  }
  return (
    <div
      className={`${size} rounded-full flex items-center justify-center text-white font-bold shrink-0 ${textSize}`}
      style={{ backgroundColor: color }}
    >
      {(name || '?').slice(0, 1)}
    </div>
  )
}

// 推し用アイコン（oshiオブジェクトから）
// 表示画像は「そのユーザーが選んだ着せ替え画像（display_image）」を最優先。
// ※ ユーザー個人のプロフィールアイコン（users.avatar）とは別物。
export function OshiAvatar({ oshi, size = 'w-12 h-12', textSize = 'text-lg' }) {
  return <Avatar image={oshi?.display_image || oshi?.image || oshi?.master_image} name={oshi?.name} color={oshi?.color} size={size} textSize={textSize} />
}

// 紙のカード
export function Card({ children, className = '' }) {
  return <div className={`bg-paper-card rounded-2xl shadow-sm border border-paper-line/60 p-4 ${className}`}>{children}</div>
}

// 画面下からせり上がるモーダル
// document.body へポータルして、スクロール領域や固定ナビより確実に最前面へ出す
// （iOSでスクロールコンテナ内の fixed が誤動作し、ボトムナビに隠れる問題への対策）
// 下端はボトムナビ・ホームインジケータ分の余白も確保して、操作ボタンが必ず押せるようにする
export function Modal({ title, onClose, children }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-paper-card rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] max-h-[88vh] scroll-area"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-wine">{title}</h2>
          <button onClick={onClose} className="text-ink-soft text-2xl leading-none px-2">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}

export function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium text-ink-soft mb-1">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-paper-line bg-white/70 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-wine/50'

export function OshiSelect({ oshiList, value, onChange, allowEmpty = true }) {
  return (
    <select className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      {allowEmpty && <option value="">（推しを選ばない）</option>}
      {oshiList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}

// ワインレッドの主ボタン
export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      className={`bg-wine hover:bg-wine-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm shadow disabled:opacity-40 transition-colors ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

// 枠線だけのボタン
export function GhostButton({ children, className = '', ...props }) {
  return (
    <button
      className={`border border-wine/50 text-wine font-medium rounded-xl px-3 py-1.5 text-sm disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Empty({ icon, message }) {
  return (
    <div className="text-center text-ink-soft py-10">
      <div className="text-4xl mb-2 opacity-70">{icon}</div>
      <p className="text-sm whitespace-pre-line">{message}</p>
    </div>
  )
}

// 読み込み中の共通表示（紙の手帳トーン。スタンプがトンと押される演出）
export function Loading({ label = '読み込み中…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center py-14 text-ink-soft ${className}`}>
      <div className="stamp-loading text-4xl leading-none">💗</div>
      <p className="text-xs mt-3 tracking-wide">{label}</p>
    </div>
  )
}

// セクション見出し（手帳のマスキングテープ風）
export function SectionTitle({ children }) {
  return (
    <div className="inline-block bg-wine/10 text-wine text-xs font-bold rounded px-2 py-1 mb-2">{children}</div>
  )
}

// オン/オフのトグルスイッチ（紙トーン）
export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 w-full">
      <span className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${checked ? 'bg-wine' : 'bg-paper-line'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
      {label && <span className="text-sm text-ink text-left">{label}</span>}
    </button>
  )
}

// 目標額に対する進捗バー
export function ProgressBar({ value, max, className = '' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={`w-full bg-paper rounded-full h-2.5 overflow-hidden border border-paper-line/60 ${className}`}>
      <div className="h-full bg-wine rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}
