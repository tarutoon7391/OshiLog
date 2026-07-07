import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { formatTime } from '../util'
import { Card, Empty, Loading, GhostButton } from '../components/ui'

// 通知センター（第15弾）：ヘッダーのベルから開く通知履歴の一覧。
// 新しい順に既読・未読の両方を表示し、未読は太字＋ワインの縁取りで区別する。
// タップすると既読にした上で、通知のリンク先へ移動する。
export default function Notifications() {
  const [rows, setRows] = useState(null)
  const nav = useNavigate()

  const reload = () => api('/notifications').then(setRows).catch(() => setRows([]))
  useEffect(() => { reload() }, [])

  const openItem = async (n) => {
    try { if (!n.is_read) await api(`/notifications/${n.id}/read`, { method: 'POST' }) } catch { /* 既読化に失敗しても遷移は続行 */ }
    nav(n.link_url || '/')
  }

  const readAll = async () => {
    try {
      await api('/notifications/read-all', { method: 'POST' })
      reload()
      window.dispatchEvent(new Event('oshilog:unread-refresh')) // ヘッダーのバッジも即時更新
    } catch (err) { alert(err.message) }
  }

  if (rows === null) return <Loading label="通知を読み込み中…" />
  const hasUnread = rows.some((n) => !n.is_read)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-wine">🔔 通知</h2>
        {hasUnread && <GhostButton onClick={readAll}>すべて既読にする</GhostButton>}
      </div>
      <p className="text-[11px] text-ink-soft">通知の種類ごとのオン/オフは、マイページ →「プロフィール設定」で変更できます。</p>

      {rows.length === 0 ? (
        <Card><Empty icon="🔔" message={'まだ通知はありません。'} /></Card>
      ) : (
        <div className="space-y-2 stagger">
          {rows.map((n) => (
            <button key={n.id} onClick={() => openItem(n)}
              className={`w-full text-left bg-paper-card rounded-2xl px-4 py-3 border ${
                n.is_read ? 'border-paper-line/60' : 'border-wine/50 border-l-4 border-l-wine'
              }`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${n.is_read ? 'text-ink-soft' : 'font-bold text-ink'}`}>{n.title}</p>
                  {n.body && <p className={`text-xs mt-0.5 line-clamp-2 break-words ${n.is_read ? 'text-ink-soft/80' : 'text-ink-soft'}`}>{n.body}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-ink-soft">{formatTime(n.created_at)}</p>
                  {!n.is_read && <span className="inline-block w-2 h-2 rounded-full bg-wine mt-1" />}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
