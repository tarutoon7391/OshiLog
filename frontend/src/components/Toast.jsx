import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// アプリ内通知トースト（紙手帳トーンの控えめなバナー）
// Service Workerからの postMessage（アプリを開いている間のプッシュ）を受けて
// 画面上部にスライドイン表示し、数秒で自動的に消える。タップでリンク先へ。
export default function PushToasts() {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)
  const nav = useNavigate()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e) => {
      const d = e.data
      if (!d || d.type !== 'push') return
      const id = ++idRef.current
      setToasts((prev) => [...prev, { id, title: d.title || '推しログ', body: d.body || '', url: d.url || '/' }])
      // 5秒で自動的に消す（消える直前に上へ戻る退場アニメーションを入れる）
      setTimeout(() => setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))), 4700)
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  const open = (t) => {
    setToasts((prev) => prev.filter((x) => x.id !== t.id))
    nav(t.url)
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-14 inset-x-0 z-50 flex justify-center pointer-events-none">
      <div className="w-full max-w-md px-3 space-y-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => open(t)}
          className={`${t.leaving ? 'toast-out' : 'toast-in'} pointer-events-auto w-full text-left bg-paper-card border border-paper-line border-l-4 border-l-wine rounded-xl shadow-lg px-3 py-2.5`}
        >
          <p className="text-sm font-bold text-ink truncate">{t.title}</p>
          {t.body && <p className="text-xs text-ink-soft mt-0.5 line-clamp-2 break-words">{t.body}</p>}
        </button>
      ))}
      </div>
    </div>
  )
}
