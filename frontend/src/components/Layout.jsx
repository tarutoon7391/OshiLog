import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
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
  const location = useLocation()

  // 第15弾：通知ベルの未読件数。画面遷移のたびに取り直し、
  // 新しい通知が届いたらSocket（notification:new）で即時更新する
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let alive = true
    api('/notifications/unread-count').then((r) => { if (alive) setUnread(r.count) }).catch(() => {})
    const s = getSocket()
    const onNew = () => api('/notifications/unread-count').then((r) => { if (alive) setUnread(r.count) }).catch(() => {})
    if (s) s.on('notification:new', onNew)
    return () => { alive = false; if (s) s.off('notification:new', onNew) }
  }, [location.pathname])

  return (
    <div className="h-[100dvh] w-full flex justify-center bg-paper">
      <div className="w-full max-w-md h-full flex flex-col bg-paper/40 shadow-xl relative overflow-hidden">
        {/* 固定ヘッダー。通知ベル（未読バッジつき）＋ユーザーアイコン（マイページへ） */}
        <header className="shrink-0 bg-wine text-white px-4 py-3 flex items-center justify-between z-20">
          <h1 className="font-bold text-lg tracking-wide">💗 推しログ</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/notifications')} aria-label="通知" className="relative press">
              <span className="text-xl leading-none">🔔</span>
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-gold text-white text-[9px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center border border-white/60">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            <button onClick={() => nav('/mypage')} className="flex items-center gap-2">
              <span className="text-xs text-white/90 max-w-24 truncate">{user.display_name || user.username}</span>
              <Avatar image={user.avatar} name={user.display_name || user.username} color="#6e2c39" size="w-8 h-8" textSize="text-sm" />
            </button>
          </div>
        </header>

        {/* スクロールするコンテンツ領域（ここだけがスクロール／上端で引っ張ると更新）。
            ページ遷移のたびに便箋を1枚重ねるようにふわっと表示する */}
        <PullToRefresh className="flex-1 min-h-0 scroll-area">
          <div key={location.pathname} className="page-in">{children}</div>
        </PullToRefresh>

        {/* AI相談のFAB：判子風の丸ボタン。スクロールしても右下に固定。
            飛び先はサイト案内AI（旧・案内タブ）。貯金AIは貯金画面内の導線から */}
        <button
          onClick={() => nav('/guide')}
          aria-label="サイト案内AIに相談"
          className="press absolute right-3 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30 w-14 h-14 rounded-full bg-wine text-white shadow-lg flex items-center justify-center"
        >
          {/* 内側の輪は箔押しゴールド（判子＋金の箔押しイメージ） */}
          <span className="w-12 h-12 rounded-full border-2 border-gold/80 flex flex-col items-center justify-center leading-none">
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
                `flex flex-col items-center py-1.5 text-[10px] ${isActive ? 'text-wine font-bold' : 'text-ink-soft'}`
              }
            >
              {({ isActive }) => (
                <>
                  {/* 選択中タブの上に、マステを貼ったようなゴールドの小さなバー */}
                  <span className={`h-[3px] w-7 rounded-full mb-1 transition-colors ${isActive ? 'bg-gold/80' : 'bg-transparent'}`} />
                  <span className="text-lg leading-none">{t.icon}</span>
                  <span className="mt-0.5">{t.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
