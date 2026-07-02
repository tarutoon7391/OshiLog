import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { formatDateJa, formatYen, VISIBILITY_MAP } from '../util'
import { Card, Modal, Empty } from '../components/ui'

// イベント履歴：過去に参加したイベント一覧＋そのイベントの参戦記録・日記
export default function EventHistory() {
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null) // { event, records, diaries }
  const nav = useNavigate()

  useEffect(() => {
    api('/events/history').then(setEvents).catch((e) => setError(e.message))
  }, [])

  const openDetail = async (ev) => {
    try {
      const log = await api(`/events/${ev.id}/mylog`)
      setDetail({ event: ev, ...log })
    } catch (err) { alert(err.message) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <button onClick={() => nav(-1)} className="text-wine text-lg">‹</button>
        <h2 className="font-bold text-lg text-wine">イベント履歴</h2>
      </div>
      <p className="text-[11px] text-ink-soft">これまでに参加した（開催が終わった）イベントの記録です。</p>
      {error && <p className="text-wine text-xs">{error}</p>}

      {events.length === 0 && <Card><Empty icon="🎪" message={'まだ参加済みの過去イベントがありません。'} /></Card>}

      {events.map((ev) => (
        <button key={ev.id} onClick={() => openDetail(ev)} className="w-full text-left">
          <Card>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold truncate">{ev.name}</p>
                <p className="text-[11px] text-ink-soft">📅 {formatDateJa(ev.event_date)}</p>
                {ev.location && <p className="text-[11px] text-ink-soft">📍 {ev.location}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-wine">{formatYen(ev.spent_amount)}</p>
                <p className="text-[10px] text-ink-soft">📝{ev.record_count}・📔{ev.diary_count}</p>
              </div>
            </div>
          </Card>
        </button>
      ))}

      {detail && (
        <Modal title={detail.event.name} onClose={() => setDetail(null)}>
          <p className="text-[11px] text-ink-soft mb-3">📅 {formatDateJa(detail.event.event_date)}</p>

          <p className="text-sm font-bold text-wine mb-1">参戦記録</p>
          {detail.records.length === 0 ? (
            <p className="text-[11px] text-ink-soft mb-3">このイベントに紐づく記録はありません</p>
          ) : (
            <div className="space-y-1 mb-3">
              {detail.records.map((r) => (
                <div key={r.id} className="flex items-center gap-2 bg-paper rounded-lg px-2.5 py-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.oshi_color || '#c8b7a0' }} />
                  <span className="text-sm flex-1 truncate">{r.title}</span>
                  <span className="text-sm font-bold">{formatYen(r.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-sm font-bold text-wine mb-1">日記</p>
          {detail.diaries.length === 0 ? (
            <p className="text-[11px] text-ink-soft">このイベントに紐づく日記はありません</p>
          ) : (
            <div className="space-y-2">
              {detail.diaries.map((d) => (
                <div key={d.id} className="diary-page rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] text-wine font-bold">{formatDateJa(d.entry_date)}</p>
                    <span className="text-[9px] text-ink-soft">{VISIBILITY_MAP[d.visibility]?.icon}</span>
                  </div>
                  {d.title && <p className="font-bold text-sm">{d.title}</p>}
                  <p className="text-sm whitespace-pre-wrap break-words line-clamp-4">{d.content}</p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
