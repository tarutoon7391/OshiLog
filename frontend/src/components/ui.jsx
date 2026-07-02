// 画面共通の小さなUI部品（紙の手帳デザイン）

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
export function OshiAvatar({ oshi, size = 'w-12 h-12', textSize = 'text-lg' }) {
  return <Avatar image={oshi?.image || oshi?.master_image} name={oshi?.name} color={oshi?.color} size={size} textSize={textSize} />
}

// 紙のカード
export function Card({ children, className = '' }) {
  return <div className={`bg-paper-card rounded-2xl shadow-sm border border-paper-line/60 p-4 ${className}`}>{children}</div>
}

// 画面下からせり上がるモーダル
export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-paper-card rounded-t-3xl p-5 max-h-[85vh] scroll-area"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-wine">{title}</h2>
          <button onClick={onClose} className="text-ink-soft text-2xl leading-none px-2">×</button>
        </div>
        {children}
      </div>
    </div>
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

// セクション見出し（手帳のマスキングテープ風）
export function SectionTitle({ children }) {
  return (
    <div className="inline-block bg-wine/10 text-wine text-xs font-bold rounded px-2 py-1 mb-2">{children}</div>
  )
}
