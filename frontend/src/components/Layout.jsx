import { NavLink, useNavigate } from 'react-router-dom'
import { Avatar } from './ui'

// 画面下部のナビゲーション
const tabs = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/oshi', icon: '⭐', label: '推し' },
  { to: '/calendar', icon: '📖', label: '予定' },
  { to: '/events', icon: '🎪', label: 'イベント' },
  { to: '/diary', icon: '📔', label: '日記' },
  { to: '/friends', icon: '👥', label: '推し友' },
  { to: '/posts', icon: '✍️', label: 'つぶやき' },
]

// ヘッダー＋ボトムナビ固定・中央のみスクロールする共通レイアウト
export default function Layout({ user, children }) {
  const nav = useNavigate()
  return (
    <div className="h-[100dvh] w-full flex justify-center bg-paper">
      <div className="w-full max-w-md h-full flex flex-col bg-paper/40 shadow-xl relative overflow-hidden">
        {/* 固定ヘッダー */}
        <header className="shrink-0 bg-wine text-white px-4 py-3 flex items-center justify-between z-20">
          <h1 className="font-bold text-lg tracking-wide">💗 推しログ</h1>
          <button onClick={() => nav('/profile')} className="flex items-center gap-2">
            <span className="text-xs text-white/90 max-w-24 truncate">{user.display_name || user.username}</span>
            <Avatar image={user.avatar} name={user.display_name || user.username} color="#6e2c39" size="w-8 h-8" textSize="text-sm" />
          </button>
        </header>

        {/* スクロールするコンテンツ領域（ここだけがスクロールする） */}
        <main className="flex-1 min-h-0 scroll-area p-4">{children}</main>

        {/* 固定ボトムナビ */}
        <nav className="shrink-0 grid grid-cols-7 bg-paper-card border-t border-paper-line z-20 pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center py-2 text-[9px] ${isActive ? 'text-wine font-bold' : 'text-ink-soft'}`
              }
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="mt-0.5">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
