import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { formatDateJa, daysUntil, formatYen } from '../util'
import { Card, Modal, Field, inputClass, PrimaryButton, GhostButton, Empty, ProgressBar } from '../components/ui'

// 共通イベント一覧（閲覧・参加は全員。作成は管理者のみ＝/admin）＋貯金目標
export default function Events({ user }) {
  const [events, setEvents] = useState([])
  const [busy, setBusy] = useState(null)
  const [goalForm, setGoalForm] = useState(null) // { id, name, savings_goal }
  const nav = useNavigate()

  const reload = () => api('/events').then(setEvents).catch(console.error)
  useEffect(() => { reload() }, [])

  const join = async (ev) => {
    setBusy(ev.id)
    try {
      const r = await api(`/events/${ev.id}/join`, { method: 'POST' })
      const s = getSocket(); if (s) s.emit('resync')
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

  const saveGoal = async (e) => {
    e.preventDefault()
    await api(`/events/${goalForm.id}/savings`, { method: 'PUT', body: { savings_goal: goalForm.savings_goal === '' ? null : Number(goalForm.savings_goal) } })
    setGoalForm(null); reload()
  }

  const now = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-wine">イベント</h2>
        <div className="flex gap-2">
          <GhostButton onClick={() => nav('/history')}>🕘 履歴</GhostButton>
          {user.is_admin && <GhostButton onClick={() => nav('/admin')}>＋ 管理</GhostButton>}
        </div>
      </div>
      <p className="text-[11px] text-ink-soft">参加するとカレンダーに追加され、参加者だけのグループトークに入れます。貯金目標も立てられます。</p>

      {events.length === 0 && <Card><Empty icon="🎪" message={'公開中のイベントはありません。'} /></Card>}

      {events.map((ev) => {
        const d = daysUntil(ev.event_date)
        const isPast = ev.event_date < now
        return (
          <Card key={ev.id}>
            {ev.image && <img src={ev.image} alt={ev.name} className="w-full h-32 object-cover rounded-xl mb-2" />}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{ev.name}</p>
                <p className="text-[11px] text-ink-soft mt-0.5">
                  📅 {formatDateJa(ev.event_date)}{d >= 0 ? `（あと${d}日）` : '（終了）'}
                </p>
                {ev.location && <p className="text-[11px] text-ink-soft">📍 {ev.location}</p>}
                {ev.artist_name && <p className="text-[11px] text-ink-soft">🎤 {ev.artist_name}</p>}
              </div>
              <span className="text-[11px] text-ink-soft shrink-0">👥 {ev.participant_count}人</span>
            </div>
            {ev.description && <p className="text-xs text-ink-soft mt-2">{ev.description}</p>}

            {/* 貯金目標の進捗（参加者のみ） */}
            {ev.joined && (
              <div className="mt-3 bg-paper rounded-xl p-3">
                {ev.savings_goal ? (
                  <>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-ink-soft">🐷 貯金目標</span>
                      <span className="font-bold text-wine">{formatYen(ev.saved_amount)} / {formatYen(ev.savings_goal)}</span>
                    </div>
                    <ProgressBar value={ev.saved_amount} max={ev.savings_goal} />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-ink-soft">
                        {ev.saved_amount >= ev.savings_goal ? '🎉 目標達成！' : `あと ${formatYen(ev.savings_goal - ev.saved_amount)}`}
                      </span>
                      <button onClick={() => setGoalForm({ id: ev.id, name: ev.name, savings_goal: ev.savings_goal })} className="text-[10px] text-wine underline">変更</button>
                    </div>
                    <p className="text-[9px] text-ink-soft mt-1">※ 家計簿でこのイベントを選んだ記録が積み上がります</p>
                  </>
                ) : (
                  <button onClick={() => setGoalForm({ id: ev.id, name: ev.name, savings_goal: '' })} className="text-xs text-wine underline">🐷 貯金目標を設定する</button>
                )}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              {ev.joined ? (
                <>
                  {ev.room_id && <PrimaryButton className="flex-1" onClick={() => nav(`/chat/${ev.room_id}`)}>💬 グループトーク</PrimaryButton>}
                  <GhostButton onClick={() => leave(ev)}>参加取消</GhostButton>
                </>
              ) : (
                <PrimaryButton className="flex-1" disabled={busy === ev.id || isPast} onClick={() => join(ev)}>
                  {busy === ev.id ? '参加中...' : isPast ? '終了しました' : '参加する'}
                </PrimaryButton>
              )}
            </div>
          </Card>
        )
      })}

      {/* 貯金目標の設定 */}
      {goalForm && (
        <Modal title="貯金目標の設定" onClose={() => setGoalForm(null)}>
          <form onSubmit={saveGoal}>
            <p className="text-sm font-bold mb-2">{goalForm.name}</p>
            <Field label="目標額（円）">
              <input type="number" min="0" className={inputClass} value={goalForm.savings_goal}
                onChange={(e) => setGoalForm({ ...goalForm, savings_goal: e.target.value })} placeholder="例：30000" />
            </Field>
            <p className="text-[11px] text-ink-soft mb-3">家計簿の記録でこのイベントを選ぶと、その合計が進捗になります。空欄で保存すると目標を解除します。</p>
            <PrimaryButton className="w-full">保存する</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
