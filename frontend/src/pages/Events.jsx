import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { formatDateJa, daysUntil } from '../util'
import { Card, PrimaryButton, GhostButton, Empty } from '../components/ui'

// 共通イベント一覧（閲覧・参加は全員。作成は管理者のみ＝/admin）
export default function Events({ user }) {
  const [events, setEvents] = useState([])
  const [busy, setBusy] = useState(null)
  const nav = useNavigate()

  const reload = () => api('/events').then(setEvents).catch(console.error)
  useEffect(() => { reload() }, [])

  const join = async (ev) => {
    setBusy(ev.id)
    try {
      const r = await api(`/events/${ev.id}/join`, { method: 'POST' })
      const s = getSocket(); if (s) s.emit('resync') // イベントルームへ参加
      reload()
      if (r.room_id) nav(`/chat/${r.room_id}`)
    } catch (err) { alert(err.message) }
    finally { setBusy(null) }
  }

  const leave = async (ev) => {
    if (!confirm(`「${ev.name}」への参加を取り消しますか？`)) return
    await api(`/events/${ev.id}/leave`, { method: 'POST' })
    const s = getSocket(); if (s) s.emit('resync')
    reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-wine">イベント</h2>
        {user.is_admin && <GhostButton onClick={() => nav('/admin')}>＋ 管理（作成）</GhostButton>}
      </div>
      <p className="text-[11px] text-ink-soft">参加するとカレンダーに追加され、参加者だけのグループトークに入れます。</p>

      {events.length === 0 && <Card><Empty icon="🎪" message={'公開中のイベントはありません。'} /></Card>}

      {events.map((ev) => {
        const d = daysUntil(ev.event_date)
        return (
          <Card key={ev.id}>
            {ev.image && <img src={ev.image} alt={ev.name} className="w-full h-32 object-cover rounded-xl mb-2" />}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{ev.name}</p>
                <p className="text-[11px] text-ink-soft mt-0.5">
                  📅 {formatDateJa(ev.event_date)}{d >= 0 ? `（あと${d}日）` : ''}
                </p>
                {ev.location && <p className="text-[11px] text-ink-soft">📍 {ev.location}</p>}
                {ev.artist_name && <p className="text-[11px] text-ink-soft">🎤 {ev.artist_name}</p>}
              </div>
              <span className="text-[11px] text-ink-soft shrink-0">👥 {ev.participant_count}人</span>
            </div>
            {ev.description && <p className="text-xs text-ink-soft mt-2">{ev.description}</p>}
            <div className="mt-3 flex gap-2">
              {ev.joined ? (
                <>
                  {ev.room_id && <PrimaryButton className="flex-1" onClick={() => nav(`/chat/${ev.room_id}`)}>💬 グループトーク</PrimaryButton>}
                  <GhostButton onClick={() => leave(ev)}>参加取消</GhostButton>
                </>
              ) : (
                <PrimaryButton className="flex-1" disabled={busy === ev.id} onClick={() => join(ev)}>
                  {busy === ev.id ? '参加中...' : '参加する'}
                </PrimaryButton>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
