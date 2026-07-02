import { NavLink } from 'react-router-dom'

// 画面下部のナビゲーション項目
const tabs = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/oshi', icon: '💖', label: '推し' },
  { to: '/schedule', icon: '📅', label: '予定' },
  { to: '/records', icon: '💰', label: '記録' },
  { to: '/goods', icon: '🎁', label: 'グッズ' },
  { to: '/posts', icon: '💬', label: 'つぶやき' },
]

// ヘッダー＋ボトムナビ付きの共通レイアウト（スマホ幅優先）
export default function Layout({ user, onLogout, children }) {
  return (
    <div className="min-h-screen bg-pink-100/60">
      <div className="mx-auto max-w-md min-h-screen flex flex-col bg-pink-50 shadow-xl">
        <header className="sticky top-0 z-20 bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold text-lg">💖 推しログ</h1>
          <div className="flex items-center gap-2 text-sm">
            <span>{user.username} さん</span>
            <button onClick={onLogout} className="bg-white/25 rounded-full px-2.5 py-1 text-xs">
              ログアウト
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24">{children}</main>

        <nav className="fixed bottom-0 inset-x-0 z-20">
          <div className="mx-auto max-w-md grid grid-cols-6 bg-white border-t border-pink-100">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center py-2 text-[10px] ${isActive ? 'text-pink-600 font-bold' : 'text-gray-400'}`
                }
              >
                <span className="text-xl leading-none">{t.icon}</span>
                <span className="mt-0.5">{t.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
