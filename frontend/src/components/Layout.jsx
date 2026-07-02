import { NavLink, useNavigate } from 'react-router-dom'
import { Avatar } from './ui'
import PullToRefresh from './PullToRefresh.jsx'

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
// 管理者だけフッターに「管理」タブを追加（管理者以外には表示されない）
const adminTab = { to: '/admin', icon: '🛠', label: '管理' }

// ヘッダー＋ボトムナビ固定・中央のみスクロールする共通レイアウト
export default function Layout({ user, children }) {
  const nav = useNavigate()
  const navTabs = user.is_admin ? [...tabs, adminTab] : tabs
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

        {/* スクロールするコンテンツ領域（ここだけがスクロール／上端で引っ張ると更新） */}
        <PullToRefresh className="flex-1 min-h-0 scroll-area">{children}</PullToRefresh>

        {/* 固定ボトムナビ（管理者は「管理」タブが増えるので列数を動的に指定） */}
        <nav className="shrink-0 grid bg-paper-card border-t border-paper-line z-20 pb-[env(safe-area-inset-bottom)]"
          style={{ gridTemplateColumns: `repeat(${navTabs.length}, minmax(0, 1fr))` }}>
          {navTabs.map((t) => (
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
