import { NavLink, useNavigate } from 'react-router-dom'
import { Avatar } from './ui'
import PullToRefresh from './PullToRefresh.jsx'

// 画面下部のナビゲーション（第9弾で4項目に整理。
// ここから外した機能はマイページ（右上のユーザーアイコン）と各ハブ画面から辿れる）
const tabs = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/calendar', icon: '📖', label: '予定' },
  { to: '/oshi', icon: '⭐', label: '推し' },
  { to: '/friends', icon: '👥', label: '推し友' },
]

// ヘッダー＋ボトムナビ固定・中央のみスクロールする共通レイアウト
export default function Layout({ user, children }) {
  const nav = useNavigate()
  return (
    <div className="h-[100dvh] w-full flex justify-center bg-paper">
      <div className="w-full max-w-md h-full flex flex-col bg-paper/40 shadow-xl relative overflow-hidden">
        {/* 固定ヘッダー。右上のユーザーアイコンからマイページへ */}
        <header className="shrink-0 bg-wine text-white px-4 py-3 flex items-center justify-between z-20">
          <h1 className="font-bold text-lg tracking-wide">💗 推しログ</h1>
          <button onClick={() => nav('/mypage')} className="flex items-center gap-2">
            <span className="text-xs text-white/90 max-w-24 truncate">{user.display_name || user.username}</span>
            <Avatar image={user.avatar} name={user.display_name || user.username} color="#6e2c39" size="w-8 h-8" textSize="text-sm" />
          </button>
        </header>

        {/* スクロールするコンテンツ領域（ここだけがスクロール／上端で引っ張ると更新） */}
        <PullToRefresh className="flex-1 min-h-0 scroll-area">{children}</PullToRefresh>

        {/* AI相談のFAB：判子風の丸ボタン。スクロールしても右下に固定。
            飛び先はサイト案内AI（旧・案内タブ）。貯金AIは貯金画面内の導線から */}
        <button
          onClick={() => nav('/guide')}
          aria-label="サイト案内AIに相談"
          className="absolute right-3 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30 w-14 h-14 rounded-full bg-wine text-white shadow-lg active:scale-95 transition-transform flex items-center justify-center"
        >
          <span className="w-12 h-12 rounded-full border-2 border-white/70 flex flex-col items-center justify-center leading-none">
            <span className="text-base">💬</span>
            <span className="text-[9px] font-bold mt-0.5">AI相談</span>
          </span>
        </button>

        {/* 固定ボトムナビ（4項目） */}
        <nav className="shrink-0 grid grid-cols-4 bg-paper-card border-t border-paper-line z-20 pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center py-2 text-[10px] ${isActive ? 'text-wine font-bold' : 'text-ink-soft'}`
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
