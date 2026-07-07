import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { formatDateJa, daysUntil, formatYen, formatTime, IMPORTANCE_LEVELS, importanceMark, importanceCardClass } from '../util'
import { Card, Modal, Field, inputClass, PrimaryButton, GhostButton, Empty, ProgressBar, Loading } from '../components/ui'

// Google Maps のクライアント設定（APIキー）はサーバーから実行時に取得する。
// キーはフロントのソースに直書きせず、環境変数→この経路でのみ受け渡す。1回だけ取得してキャッシュ。
let mapsConfigPromise = null
function getMapsConfig() {
  if (!mapsConfigPromise) mapsConfigPromise = api('/maps/config').catch(() => ({ enabled: false }))
  return mapsConfigPromise
}

// 共通イベント一覧＋貯金（参戦記録＝支出とは完全に別の、入出金で管理する貯金）
export default function Events({ user }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [goalForm, setGoalForm] = useState(null)   // 目標額の設定 { id, name, savings_goal }
  const [savings, setSavings] = useState(null)      // 貯金モーダル { event, state }
  const nav = useNavigate()

  // 通知タップからのディープリンク（/events?focus=ID）：該当イベントへスクロールして一時ハイライト
  const [params] = useSearchParams()
  const focusId = Number(params.get('focus')) || null
  const focusRef = useRef(null)
  const [flash, setFlash] = useState(false)
  // ホームの貯金カードからの遷移（/events?focus=ID&savings=1）で入出金モーダルを自動で開いたか
  const savingsOpened = useRef(false)

  const reload = () => api('/events').then(setEvents).catch(console.error).finally(() => setLoading(false))
  useEffect(() => { reload() }, [])

  useEffect(() => {
    if (loading || !focusId || !focusRef.current) return
    focusRef.current.scrollIntoView({ block: 'center' })
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 3000)
    return () => clearTimeout(t)
  }, [loading, focusId])

  // 第12弾：savings=1 付きで遷移してきたら、対象イベントの貯金（入出金）モーダルを1回だけ自動で開く
  useEffect(() => {
    if (loading || !focusId || params.get('savings') !== '1' || savingsOpened.current) return
    const ev = events.find((e) => e.id === focusId)
    if (ev && ev.joined) { savingsOpened.current = true; openSavings(ev) }
  }, [loading, focusId, events])

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
    if (savings && savings.event.id === goalForm.id) openSavings(savings.event) // 開いていれば更新
  }

  const openSavings = async (ev) => {
    try {
      const state = await api(`/events/${ev.id}/savings`)
      setSavings({ event: ev, state })
    } catch (err) { alert(err.message) }
  }

  // 第14弾：参加イベントの重要度を変更（変更後は一覧を取り直して色に反映）
  const setImportance = async (ev, value) => {
    try {
      await api(`/events/${ev.id}/importance`, { method: 'PUT', body: { importance: value } })
      reload()
    } catch (err) { alert(err.message) }
  }

  const now = new Date().toISOString().slice(0, 10)

  if (loading) return <Loading label="イベントを読み込み中…" />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-wine">イベント</h2>
        <div className="flex gap-2">
          <GhostButton onClick={() => nav('/history')}>🕘 履歴</GhostButton>
        </div>
      </div>
      <p className="text-[11px] text-ink-soft">参加するとカレンダーに追加され、参加者だけのグループトークに入れます。貯金目標も立てられます。</p>

      {events.length === 0 && <Card><Empty icon="🎪" message={'公開中のイベントはありません。'} /></Card>}

      <div className="space-y-3 stagger">
      {events.map((ev) => {
        const d = daysUntil(ev.event_date)
        const isPast = ev.event_date < now
        return (
          <div key={ev.id} ref={ev.id === focusId ? focusRef : null} className="scroll-mt-16">
          <Card className={`${ev.id === focusId && flash ? 'ring-2 ring-wine' : ''} ${ev.joined ? importanceCardClass(ev.importance) : ''}`}>
            {ev.image && <img src={ev.image} alt={ev.name} className="w-full h-32 object-cover rounded-xl mb-2" />}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{ev.joined && importanceMark(ev.importance) && <span className="mr-0.5">{importanceMark(ev.importance)}</span>}{ev.name}</p>
                <p className="text-[11px] text-ink-soft mt-0.5">
                  📅 {formatDateJa(ev.event_date)}{d >= 0 ? `（あと${d}日）` : '（終了）'}
                </p>
                {ev.location && <p className="text-[11px] text-ink-soft">📍 {ev.location}</p>}
                {ev.artist_name && <p className="text-[11px] text-ink-soft">🎤 {ev.artist_name}</p>}
              </div>
              <span className="text-[11px] text-ink-soft shrink-0">👥 {ev.participant_count}人</span>
            </div>
            {ev.description && <p className="text-xs text-ink-soft mt-2">{ev.description}</p>}

            {/* 会場の地図・アクセス（会場が紐づいているときだけ表示） */}
            <VenueMap event={ev} />

            {/* 第14弾：重要度の設定（参加者のみ）。色分けはカレンダー・ホーム・一覧に反映される */}
            {ev.joined && (
              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-ink-soft shrink-0">重要度</span>
                {IMPORTANCE_LEVELS.map((l) => {
                  const active = (ev.importance || 'normal') === l.key
                  return (
                    <button key={l.key} onClick={() => setImportance(ev, l.key)}
                      className={`text-[10px] rounded-full px-2.5 py-1 border transition-colors ${
                        active
                          ? (l.key === 'very_important' ? 'bg-wine-dark text-white border-wine-dark' : 'bg-wine text-white border-wine')
                          : 'border-paper-line text-ink-soft'
                      }`}>
                      {importanceMark(l.key)}{l.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* 貯金（参加者のみ）。バーやカードをタップで入出金モーダルへ */}
            {ev.joined && (
              <div className="mt-3 bg-paper rounded-xl p-3">
                {ev.savings_goal ? (
                  <button onClick={() => openSavings(ev)} className="w-full text-left">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-ink-soft">🐷 貯金</span>
                      <span className="font-bold text-wine">{formatYen(ev.saved_amount)} / {formatYen(ev.savings_goal)}</span>
                    </div>
                    <ProgressBar value={ev.saved_amount} max={ev.savings_goal} />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-ink-soft">
                        {ev.saved_amount >= ev.savings_goal ? '🎉 目標達成！' : `目標まで あと ${formatYen(Math.max(0, ev.savings_goal - ev.saved_amount))}`}
                      </span>
                      <span className="text-[10px] text-wine underline">貯金・引き出し ›</span>
                    </div>
                  </button>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-soft">🐷 貯金残高 {formatYen(ev.saved_amount)}</span>
                    <div className="flex gap-3">
                      <button onClick={() => openSavings(ev)} className="text-xs text-wine underline">入出金</button>
                      <button onClick={() => setGoalForm({ id: ev.id, name: ev.name, savings_goal: '' })} className="text-xs text-wine underline">目標を設定</button>
                    </div>
                  </div>
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
          </div>
        )
      })}
      </div>

      {/* 貯金目標の設定 */}
      {goalForm && (
        <Modal title="貯金目標の設定" onClose={() => setGoalForm(null)}>
          <form onSubmit={saveGoal}>
            <p className="text-sm font-bold mb-2">{goalForm.name}</p>
            <Field label="目標額（円）">
              <input type="number" min="0" className={inputClass} value={goalForm.savings_goal}
                onChange={(e) => setGoalForm({ ...goalForm, savings_goal: e.target.value })} placeholder="例：30000" />
            </Field>
            <p className="text-[11px] text-ink-soft mb-3">目標に対して、貯金（入金）の残高がどれくらい貯まったかを表示します。空欄で保存すると目標を解除します。</p>
            <PrimaryButton className="w-full">保存する</PrimaryButton>
          </form>
        </Modal>
      )}

      {/* 貯金の入出金モーダル */}
      {savings && (
        <SavingsModal event={savings.event} state={savings.state}
          onClose={() => setSavings(null)}
          onChanged={() => { openSavings(savings.event); reload() }}
          onEditGoal={() => setGoalForm({ id: savings.event.id, name: savings.event.name, savings_goal: savings.state.savings_goal ?? '' })} />
      )}
    </div>
  )
}

// 会場の地図・アクセス情報（Google Maps埋め込み＋最寄り駅ルート＋運賃メモ）。
// 会場が未設定なら何も表示しない。APIキー未設定でもGoogleマップへのリンクにフォールバック。
function VenueMap({ event }) {
  const [cfg, setCfg] = useState(null)
  const [route, setRoute] = useState(null)
  const [routeBusy, setRouteBusy] = useState(false)
  useEffect(() => { getMapsConfig().then(setCfg) }, [])

  if (!event.venue_id) return null
  const hasCoord = event.venue_lat != null && event.venue_lng != null
  const q = hasCoord ? `${event.venue_lat},${event.venue_lng}` : encodeURIComponent(event.venue_address || event.venue_name || '')

  const loadRoute = async () => {
    setRouteBusy(true)
    try { setRoute(await api(`/events/${event.id}/route`)) }
    catch { setRoute({ enabled: false }) }
    finally { setRouteBusy(false) }
  }

  return (
    <div className="mt-3 bg-paper rounded-xl p-3">
      <p className="text-xs font-bold text-wine mb-1">📍 会場アクセス</p>
      <p className="text-sm font-bold">{event.venue_name}</p>
      {event.venue_address && <p className="text-[11px] text-ink-soft">{event.venue_address}</p>}

      {/* 地図：APIキーがあれば埋め込み、なければGoogleマップを開くリンク */}
      {cfg && cfg.enabled && hasCoord && (
        <iframe title={`${event.venue_name}の地図`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
          className="w-full h-44 rounded-lg mt-2 border border-paper-line"
          src={`https://www.google.com/maps/embed/v1/place?key=${cfg.apiKey}&q=${q}&language=ja&zoom=15`} />
      )}
      {cfg && !cfg.enabled && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer"
          className="inline-block text-[11px] text-wine underline mt-2">Googleマップで開く ›</a>
      )}

      {/* 最寄り駅とルート */}
      {event.venue_station && (
        <div className="mt-2">
          <p className="text-[11px] text-ink-soft">🚉 最寄り駅：{event.venue_station}</p>
          <button onClick={loadRoute} disabled={routeBusy} className="text-[11px] text-wine underline mt-0.5 disabled:opacity-50">
            {routeBusy ? '検索中…' : '最寄り駅までのルートを表示 ›'}
          </button>
          {route && route.enabled && route.found && (
            <p className="text-[11px] text-ink-soft mt-1">
              🚃 {route.station} まで 公共交通機関で約{route.duration_min}分{route.distance_m ? `・${(route.distance_m / 1000).toFixed(1)}km` : ''}
            </p>
          )}
          {route && route.enabled && route.found === false && (
            <p className="text-[11px] text-ink-soft mt-1">ルートが見つかりませんでした。</p>
          )}
          {route && !route.enabled && (
            <p className="text-[11px] text-ink-soft mt-1">ルート情報は現在利用できません。</p>
          )}
        </div>
      )}

      {/* 運賃・所要時間メモ（管理者の任意入力。自動取得はしない） */}
      {event.venue_fare_note && (
        <p className="text-[11px] text-ink-soft mt-2 whitespace-pre-wrap">💰 {event.venue_fare_note}</p>
      )}
    </div>
  )
}

// 貯金の入金・出金・履歴を扱うモーダル（残高 = 入金合計 − 出金合計。参戦記録とは無関係）
function SavingsModal({ event, state, onClose, onChanged, onEditGoal }) {
  const [type, setType] = useState('deposit') // deposit | withdrawal
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // 貯金サポートAI
  const [aiReply, setAiReply] = useState('')
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiRemaining, setAiRemaining] = useState(null)
  const balance = state.balance
  const goal = state.savings_goal

  const askAi = async () => {
    setAiBusy(true)
    try {
      const r = await api(`/events/${event.id}/savings/ai`, { method: 'POST', body: { message: aiQuestion || null } })
      setAiReply(r.reply); setAiRemaining(r.remaining); setAiQuestion('')
    } catch (err) { setAiReply(err.message) }
    finally { setAiBusy(false) }
  }

  const submit = async (e) => {
    e.preventDefault(); setError('')
    const n = Math.floor(Number(amount))
    if (!n || n <= 0) { setError('金額を正しく入力してください'); return }
    if (type === 'withdrawal' && n > balance) { setError('貯金残高を超える金額は引き出せません'); return }
    setBusy(true)
    try {
      await api(`/events/${event.id}/savings/transactions`, { method: 'POST', body: { type, amount: n, memo: memo || null } })
      setAmount(''); setMemo(''); onChanged()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal title={`🐷 ${event.name} の貯金`} onClose={onClose}>
      {/* 残高・目標・達成度 */}
      <div className="bg-paper rounded-xl p-3 mb-3">
        <p className="text-center text-[11px] text-ink-soft">現在の貯金残高</p>
        <p className="text-center text-2xl font-black text-wine">{formatYen(balance)}</p>
        {goal ? (
          <>
            <div className="flex items-center justify-between text-[11px] mt-2 mb-1">
              <span className="text-ink-soft">目標 {formatYen(goal)}</span>
              <span className="text-wine font-bold">{Math.min(100, Math.round((balance / goal) * 100))}%</span>
            </div>
            <ProgressBar value={balance} max={goal} />
            <button onClick={onEditGoal} className="text-[10px] text-wine underline mt-1">目標を変更</button>
          </>
        ) : (
          <button onClick={onEditGoal} className="block mx-auto text-[11px] text-wine underline mt-1">目標額を設定する</button>
        )}
      </div>

      {/* 貯金サポートAI */}
      <div className="bg-wine/5 border border-wine/20 rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-wine">🤖 貯金サポートAI</p>
          {aiRemaining != null && <span className="text-[10px] text-ink-soft">本日あと{aiRemaining}回</span>}
        </div>
        {aiReply && <p className="text-sm text-ink whitespace-pre-wrap break-words bg-paper-card rounded-lg p-2.5 mb-2 border border-paper-line/60">{aiReply}</p>}
        <input className={inputClass + ' mb-2'} value={aiQuestion} maxLength={200}
          onChange={(e) => setAiQuestion(e.target.value)} placeholder="相談したいことを入力（任意）" />
        <GhostButton className="w-full" disabled={aiBusy} onClick={askAi}>
          {aiBusy ? '考え中…' : aiReply ? 'もう一度相談する' : 'AIに相談する'}
        </GhostButton>
      </div>

      {/* 入金／出金 */}
      <div className="grid grid-cols-2 gap-1 bg-paper rounded-xl p-1 mb-2 text-sm font-bold">
        <button type="button" className={`rounded-lg py-1.5 ${type === 'deposit' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => { setType('deposit'); setError('') }}>＋ 貯金する</button>
        <button type="button" className={`rounded-lg py-1.5 ${type === 'withdrawal' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => { setType('withdrawal'); setError('') }}>－ 引き出す</button>
      </div>
      <form onSubmit={submit}>
        <Field label={type === 'deposit' ? '貯金する金額（円）' : '引き出す金額（円）'}>
          <input type="number" min="1" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="例：3000" />
        </Field>
        <Field label="メモ（任意）">
          <input className={inputClass} value={memo} maxLength={100} onChange={(e) => setMemo(e.target.value)} placeholder="例：バイト代から" />
        </Field>
        {type === 'withdrawal' && <p className="text-[10px] text-ink-soft -mt-2 mb-2">※ 残高（{formatYen(balance)}）を超える引き出しはできません。目標未達でもいつでも引き出せます。</p>}
        {error && <p className="text-wine text-xs mb-2">{error}</p>}
        <PrimaryButton className="w-full" disabled={busy}>{type === 'deposit' ? '貯金する' : '引き出す'}</PrimaryButton>
      </form>

      {/* 入出金履歴 */}
      <p className="text-sm font-bold text-wine mt-4 mb-1">入出金の履歴</p>
      {state.transactions.length === 0 ? (
        <p className="text-[11px] text-ink-soft">まだ入出金がありません。</p>
      ) : (
        <div className="space-y-1">
          {state.transactions.map((t) => (
            <div key={t.id} className="flex items-center gap-2 bg-paper rounded-lg px-2.5 py-1.5">
              <span className={`text-sm shrink-0 ${t.type === 'deposit' ? 'text-[#5e7a5b]' : 'text-wine'}`}>{t.type === 'deposit' ? '＋' : '－'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">{formatYen(t.amount)}<span className="text-[10px] text-ink-soft font-normal ml-1">{t.type === 'deposit' ? '貯金' : '引き出し'}</span></p>
                {t.memo && <p className="text-[11px] text-ink-soft truncate">{t.memo}</p>}
              </div>
              <span className="text-[10px] text-ink-soft shrink-0">{formatTime(t.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
