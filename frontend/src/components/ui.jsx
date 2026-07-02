// 画面共通の小さなUI部品

// 推しのアイコン（画像がなければ推しカラー＋頭文字）
export function OshiAvatar({ oshi, size = 'w-12 h-12', textSize = 'text-lg' }) {
  if (oshi?.image) {
    return <img src={oshi.image} alt={oshi.name} className={`${size} rounded-full object-cover shrink-0`} />
  }
  return (
    <div
      className={`${size} rounded-full flex items-center justify-center text-white font-bold shrink-0 ${textSize}`}
      style={{ backgroundColor: oshi?.color || '#9ca3af' }}
    >
      {(oshi?.name || '?').slice(0, 1)}
    </div>
  )
}

// 白背景の角丸カード
export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl shadow-sm p-4 ${className}`}>{children}</div>
}

// 画面下からせり上がるモーダル（スマホ想定）
export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none px-2">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// フォームのラベル＋入力欄
export function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400'

// 推し選択のセレクトボックス（未選択も許可）
export function OshiSelect({ oshiList, value, onChange, allowEmpty = true }) {
  return (
    <select className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      {allowEmpty && <option value="">（推しを選ばない）</option>}
      {oshiList.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  )
}

// ピンクの主ボタン
export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      className={`bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold rounded-xl px-4 py-2.5 text-sm shadow disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

// データがないときの案内表示
export function Empty({ icon, message }) {
  return (
    <div className="text-center text-gray-400 py-10">
      <div className="text-4xl mb-2">{icon}</div>
      <p className="text-sm whitespace-pre-line">{message}</p>
    </div>
  )
}
