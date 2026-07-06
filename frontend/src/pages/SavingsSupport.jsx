import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { formatDateJa, formatYen } from '../util'
import { Card, inputClass, GhostButton, PrimaryButton, ProgressBar, Empty, Loading } from '../components/ui'

// 貯金サポート：FAB（右下のAI相談ボタン）の遷移先。
// 参加中のイベントを選んで貯金サポートAIに相談できるほか、貯金目標の一覧をまとめて見られる。
// AI・貯金のロジックは既存API（/events/:id/savings/ai ほか）をそのまま利用する。
export default function SavingsSupport() {
  const [events, setEvents] = useState(null) // 参加中イベント
  const [sel, setSel] = useState(null)       // 相談対象のイベントID
  const [question, setQuestion] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const nav = useNavigate()
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    api('/events').then((list) => {
      const joined = list.filter((e) => e.joined)
      setEvents(joined)
      // 直近の開催前イベントを初期選択にする
      const upcoming = joined.filter((e) => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date))
      const first = upcoming[0] || joined[0]
      if (first) setSel(first.id)
    }).catch(() => setEvents([]))
    api('/ai/status').then((s) => setRemaining(s.remaining)).catch(() => {})
  }, [])

  const ask = async () => {
    if (!sel) return
    setBusy(true)
    try {
      const r = await api(`/events/${sel}/savings/ai`, { method: 'POST', body: { message: question || null } })
      setReply(r.reply); setRemaining(r.remaining); setQuestion('')
    } catch (err) { setReply(err.message) }
    finally { setBusy(false) }
  }

  if (events === null) return <Loading label="読み込み中…" />

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-lg text-wine">🐷 貯金サポート</h2>

      {events.length === 0 ? (
        <Card>
          <Empty icon="🎪" message="参加中のイベントがありません。イベントに参加すると、貯金とAI相談が使えます。" />
          <PrimaryButton className="w-full mt-3" onClick={() => nav('/events')}>イベントをさがす</PrimaryButton>
        </Card>
      ) : (
        <>
          {/* AI相談（イベントを選んで相談） */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-wine">🤖 貯金サポートAI</p>
              {remaining != null && <span className="text-[10px] text-ink-soft">本日あと{remaining}回</span>}
            </div>
            <p className="text-[11px] text-ink-soft mb-2">相談したいイベントを選んでください。貯金の進み具合に合わせて助言してくれます。</p>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {events.map((e) => (
                <button key={e.id} type="button" onClick={() => { setSel(e.id); setReply('') }}
                  className={`text-xs rounded-full px-3 py-1.5 border max-w-full truncate ${sel === e.id ? 'bg-wine text-white border-wine' : 'border-paper-line text-ink-soft'}`}>
                  {e.name}
                </button>
              ))}
            </div>
            {reply && <p className="text-sm text-ink whitespace-pre-wrap break-words bg-paper rounded-lg p-2.5 mb-2 border border-paper-line/60">{reply}</p>}
            <input className={inputClass + ' mb-2'} value={question} maxLength={200}
              onChange={(e) => setQuestion(e.target.value)} placeholder="相談したいことを入力（任意）" />
            <GhostButton className="w-full" disabled={busy || !sel} onClick={ask}>
              {busy ? '考え中…' : reply ? 'もう一度相談する' : 'AIに相談する'}
            </GhostButton>
          </Card>

          {/* 貯金目標の一覧（詳細な入出金は各イベントのカードから） */}
          <div>
            <p className="text-sm font-bold text-wine mb-2">貯金目標一覧</p>
            <div className="space-y-2 stagger">
              {events.map((e) => (
                <Card key={e.id} className="p-3">
                  <button onClick={() => nav(`/events?focus=${e.id}`)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold truncate">{e.name}</p>
                      <span className="text-[10px] text-ink-soft shrink-0">{formatDateJa(e.event_date)}</span>
                    </div>
                    {e.savings_goal ? (
                      <>
                        <div className="flex items-center justify-between text-[11px] mt-1.5 mb-1">
                          <span className="text-ink-soft">🐷 {formatYen(e.saved_amount)} / {formatYen(e.savings_goal)}</span>
                          <span className="font-bold text-wine">{Math.min(100, Math.round(((e.saved_amount || 0) / e.savings_goal) * 100))}%</span>
                        </div>
                        <ProgressBar value={e.saved_amount || 0} max={e.savings_goal} />
                      </>
                    ) : (
                      <p className="text-[11px] text-ink-soft mt-1">🐷 残高 {formatYen(e.saved_amount || 0)}（目標未設定）</p>
                    )}
                    <p className="text-[10px] text-wine underline mt-1.5">イベントページで入出金・目標設定 ›</p>
                  </button>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
