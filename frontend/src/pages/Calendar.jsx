import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { EVENT_TYPES, EVENT_ICONS, todayStr, formatDateJa, formatHm } from '../util'
import { Modal, Field, inputClass, OshiSelect, PrimaryButton, GhostButton, Empty, Avatar, Loading } from '../components/ui'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
const pad = (n) => String(n).padStart(2, '0')

// 連続する13か月分（先月〜1年先）を用意する
function buildMonths() {
  const now = new Date()
  const months = []
  for (let i = -1; i <= 11; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return months
}

function monthCells(year, month) {
  const startDow = new Date(year, month - 1, 1).getDay()
  const days = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  return cells
}

const emptyForm = { title: '', event_type: 'ライブ', event_date: '', oshi_id: null, memo: '', start_time: '', end_time: '', shared_with: [] }

// 開始時刻でソート（時刻未指定＝終日は先頭に）
const byTime = (a, b) => {
  if (!a.start_time && !b.start_time) return a.id - b.id
  if (!a.start_time) return -1
  if (!b.start_time) return 1
  return a.start_time.localeCompare(b.start_time)
}

// iPhoneカレンダー準拠：縦スクロールの連続月ビュー＋日付タップ選択＋ダブルタップで1日詳細
export default function Calendar() {
  const [schedules, setSchedules] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [friends, setFriends] = useState([])
  const [selected, setSelected] = useState(todayStr())
  const [detailDate, setDetailDate] = useState(null) // 1日ビュー表示中の日付
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyWithEvents, setOnlyWithEvents] = useState(false) // 予定がある月だけ表示
  const [loading, setLoading] = useState(true)
  const months = useMemo(buildMonths, [])
  const todayRef = useRef(null)
  const today = todayStr()

  const reload = () => api('/schedules').then(setSchedules).catch(console.error).finally(() => setLoading(false))
  useEffect(() => {
    reload()
    api('/oshi').then(setOshiList).catch(console.error)
    api('/friends').then(setFriends).catch(console.error)
  }, [])

  // 読み込み完了後に今月へスクロール
  useEffect(() => {
    if (!loading && todayRef.current) todayRef.current.scrollIntoView({ block: 'start' })
  }, [loading, months])

  // 日付ごとに予定をまとめる
  const byDate = useMemo(() => {
    const m = {}
    schedules.forEach((s) => { (m[s.event_date] || (m[s.event_date] = [])).push(s) })
    return m
  }, [schedules])

  // 予定のある月（YYYY-MM）の集合（月表示改善に使用）
  const monthsWithEvents = useMemo(() => {
    const set = new Set()
    schedules.forEach((s) => set.add(s.event_date.slice(0, 7)))
    return set
  }, [schedules])

  const lastTap = useRef({ date: null, at: 0 })
  const tapDay = (dateStr) => {
    const now = Date.now()
    if (lastTap.current.date === dateStr && now - lastTap.current.at < 320) {
      setDetailDate(dateStr) // ダブルタップ → 1日詳細へ
    } else {
      setSelected(dateStr)
    }
    lastTap.current = { date: dateStr, at: now }
  }

  const save = async (e) => {
    e.preventDefault(); setError('')
    try {
      const body = { ...form, start_time: form.start_time || null, end_time: form.end_time || null }
      if (form.id) await api(`/schedules/${form.id}`, { method: 'PUT', body })
      else await api('/schedules', { method: 'POST', body })
      setForm(null); reload()
    } catch (err) { setError(err.message) }
  }

  const remove = async (s) => {
    if (!s.is_own) return
    if (!confirm(`「${s.title}」を削除しますか？`)) return
    await api(`/schedules/${s.id}`, { method: 'DELETE' }); reload()
  }

  const openAdd = (dateStr) => setForm({ ...emptyForm, event_date: dateStr || selected || today })
  const openEdit = (s) => setForm({
    id: s.id, title: s.title, event_type: s.event_type, event_date: s.event_date,
    oshi_id: s.oshi_id, memo: s.memo || '',
    start_time: formatHm(s.start_time) || '', end_time: formatHm(s.end_time) || '',
    shared_with: s.shared_user_ids || [],
  })

  const toggleShare = (uid) => setForm((f) => {
    const has = f.shared_with.includes(uid)
    return { ...f, shared_with: has ? f.shared_with.filter((x) => x !== uid) : [...f.shared_with, uid] }
  })

  // 検索結果
  const results = query.trim()
    ? schedules.filter((s) => (s.title + (s.memo || '') + (s.oshi_name || '')).includes(query.trim()))
    : null

  const detailEvents = detailDate ? [...(byDate[detailDate] || [])].sort(byTime) : []
  const visibleMonths = onlyWithEvents
    ? months.filter((m) => monthsWithEvents.has(`${m.year}-${pad(m.month)}`) || (m.year === new Date().getFullYear() && m.month === new Date().getMonth() + 1))
    : months

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-wine">カレンダー</h2>
        <PrimaryButton onClick={() => openAdd()}>＋ 予定</PrimaryButton>
      </div>

      {/* 検索（iPhoneカレンダー準拠の導線） */}
      <input className={inputClass} placeholder="🔍 予定を検索" value={query} onChange={(e) => setQuery(e.target.value)} />

      {results ? (
        <div className="space-y-2">
          {results.length === 0 && <Empty icon="🔍" message="見つかりませんでした" />}
          {results.map((s) => (
            <button key={s.id} onClick={() => { setQuery(''); setDetailDate(s.event_date) }}
              className="w-full text-left bg-paper-card rounded-xl border border-paper-line/60 px-3 py-2 flex items-center gap-2">
              <span>{EVENT_ICONS[s.event_type] || '📌'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{s.title}{!s.is_own && <span className="text-[10px] text-ink-soft">（{s.owner_name}）</span>}</p>
                <p className="text-[11px] text-ink-soft">{formatDateJa(s.event_date)}{formatHm(s.start_time) ? ` ${formatHm(s.start_time)}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
      ) : loading ? (
        <Loading label="予定を読み込み中…" />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-ink-soft">タップで選択・ダブルタップで詳細</p>
            <button onClick={() => setOnlyWithEvents((v) => !v)}
              className={`text-[11px] rounded-full px-2.5 py-1 border ${onlyWithEvents ? 'bg-wine text-white border-wine' : 'border-paper-line text-ink-soft'}`}>
              {onlyWithEvents ? '全ての月' : '予定のある月だけ'}
            </button>
          </div>
          {visibleMonths.map(({ year, month }) => {
            const isCurrent = year === new Date().getFullYear() && month === new Date().getMonth() + 1
            const hasEvents = monthsWithEvents.has(`${year}-${pad(month)}`)
            return (
              <div key={`${year}-${month}`} ref={isCurrent ? todayRef : null}
                className={`bg-paper-card rounded-2xl border border-paper-line/60 p-3 scroll-mt-2 ${!hasEvents && !isCurrent ? 'opacity-45' : ''}`}>
                <p className="font-bold text-center text-ink mb-2">
                  {year}年 {month}月
                  {!hasEvents && !isCurrent && <span className="text-[10px] text-ink-soft font-normal ml-1">予定なし</span>}
                </p>
                <div className="grid grid-cols-7 text-center text-[11px] mb-1">
                  {WEEK.map((w, i) => (
                    <span key={w} className={i === 0 ? 'text-wine' : i === 6 ? 'text-[#4a6d7c]' : 'text-ink-soft'}>{w}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-paper-line/50 rounded overflow-hidden">
                  {monthCells(year, month).map((d, i) => {
                    if (d === null) return <div key={i} className="bg-paper-card h-14" />
                    const dateStr = `${year}-${pad(month)}-${pad(d)}`
                    const events = [...(byDate[dateStr] || [])].sort(byTime)
                    const isToday = dateStr === today
                    const isSel = dateStr === selected
                    const dow = (i % 7)
                    return (
                      <button key={i} onClick={() => tapDay(dateStr)}
                        className="bg-paper-card h-14 p-0.5 flex flex-col items-center text-left relative">
                        <span className={`text-[11px] w-5 h-5 flex items-center justify-center ${isSel ? 'stamp-ring text-wine font-bold' : ''} ${isToday && !isSel ? 'bg-wine text-white rounded-full' : ''} ${dow === 0 ? 'text-wine' : dow === 6 ? 'text-[#4a6d7c]' : 'text-ink'}`}>
                          {d}
                        </span>
                        <div className="w-full mt-0.5 space-y-px overflow-hidden">
                          {events.slice(0, 2).map((s) => (
                            <div key={s.id} className="text-[8px] leading-tight text-white rounded px-0.5 truncate"
                              style={{ backgroundColor: s.is_own ? (s.oshi_color || '#8b3a4a') : '#a88' }}>
                              {s.is_own ? '' : '👤'}{s.title}
                            </div>
                          ))}
                          {events.length > 2 && <div className="text-[8px] text-ink-soft text-center">+{events.length - 2}</div>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* 1日詳細（時間軸ふうの1日ビュー） */}
      {detailDate && (
        <Modal title={formatDateJa(detailDate)} onClose={() => setDetailDate(null)}>
          {detailEvents.length === 0
            ? <Empty icon="🗓️" message="この日の予定はありません" />
            : (
              <ul className="relative border-l-2 border-paper-line ml-2 space-y-3">
                {detailEvents.map((s) => (
                  <li key={s.id} className="ml-4 relative">
                    <span className="absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 border-paper-card"
                      style={{ backgroundColor: s.is_own ? (s.oshi_color || '#8b3a4a') : '#a88' }} />
                    <div className="bg-paper rounded-xl p-3">
                      <p className="text-[11px] font-bold text-wine">
                        {formatHm(s.start_time)
                          ? `${formatHm(s.start_time)}${formatHm(s.end_time) ? `〜${formatHm(s.end_time)}` : ''}`
                          : '終日'}
                      </p>
                      <p className="font-bold text-sm">{EVENT_ICONS[s.event_type] || '📌'} {s.title}</p>
                      <p className="text-[11px] text-ink-soft mt-0.5">
                        {s.event_type}{s.oshi_name ? `・${s.oshi_name}` : ''}
                        {!s.is_own && <span className="ml-1">👤 {s.owner_name}さんの共有予定</span>}
                        {s.is_own && s.shared_user_ids && s.shared_user_ids.length > 0 && <span className="ml-1 text-wine">🔗 {s.shared_user_ids.length}人に共有中</span>}
                      </p>
                      {s.memo && <p className="text-[11px] text-ink-soft mt-1">{s.memo}</p>}
                      {s.is_own && (
                        <div className="flex gap-3 mt-1.5">
                          <button onClick={() => { setDetailDate(null); openEdit(s) }} className="text-[11px] text-wine underline">編集</button>
                          <button onClick={() => remove(s)} className="text-[11px] text-ink-soft underline">削除</button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          <PrimaryButton className="w-full mt-4" onClick={() => { const d = detailDate; setDetailDate(null); openAdd(d) }}>
            この日に予定を追加
          </PrimaryButton>
        </Modal>
      )}

      {/* 予定 追加・編集 */}
      {form && (
        <Modal title={form.id ? '予定を編集' : '予定を追加'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Field label="タイトル *">
              <input className={inputClass} value={form.title} maxLength={50}
                onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：東京公演" />
            </Field>
            <Field label="種類">
              <div className="flex gap-1.5 flex-wrap">
                {EVENT_TYPES.map((t) => (
                  <button type="button" key={t}
                    className={`text-xs rounded-full px-3 py-1.5 border ${form.event_type === t ? 'bg-wine text-white border-wine' : 'border-paper-line text-ink-soft'}`}
                    onClick={() => setForm({ ...form, event_type: t })}>{EVENT_ICONS[t]} {t}</button>
                ))}
              </div>
            </Field>
            <Field label="日付 *">
              <input type="date" className={inputClass} value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="開始時刻（任意）">
                <input type="time" className={inputClass} value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </Field>
              <Field label="終了時刻（任意）">
                <input type="time" className={inputClass} value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </Field>
            </div>
            <p className="text-[10px] text-ink-soft -mt-2 mb-3">時刻を空欄にすると終日予定になります</p>
            <Field label="推し">
              <OshiSelect oshiList={oshiList} value={form.oshi_id} onChange={(v) => setForm({ ...form, oshi_id: v })} />
            </Field>
            <Field label="メモ">
              <input className={inputClass} value={form.memo} maxLength={100}
                onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="例：物販は14時から" />
            </Field>

            {/* 共有設定：フレンド選択式 */}
            <div className="mb-3">
              <p className="text-sm font-medium text-ink-soft mb-1">共有 🔗</p>
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={() => setForm({ ...form, shared_with: [] })}
                  className={`flex-1 text-xs rounded-lg py-1.5 border ${form.shared_with.length === 0 ? 'bg-wine text-white border-wine' : 'border-paper-line text-ink-soft'}`}>
                  共有しない
                </button>
                <button type="button" onClick={() => { if (form.shared_with.length === 0 && friends[0]) toggleShare(friends[0].id) }}
                  className={`flex-1 text-xs rounded-lg py-1.5 border ${form.shared_with.length > 0 ? 'bg-wine text-white border-wine' : 'border-paper-line text-ink-soft'}`}>
                  推し友に共有
                </button>
              </div>
              {form.shared_with.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto scroll-area">
                  {friends.length === 0 && <p className="text-[11px] text-wine">推し友がいません。まず推し友になりましょう。</p>}
                  {friends.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 bg-paper rounded-lg px-2 py-1.5">
                      <input type="checkbox" checked={form.shared_with.includes(f.id)} onChange={() => toggleShare(f.id)} />
                      <Avatar image={f.avatar} name={f.display_name} size="w-6 h-6" textSize="text-[10px]" />
                      <span className="text-sm truncate">{f.display_name}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-ink-soft mt-1">選んだ推し友のカレンダーにだけ、この予定が表示されます。</p>
            </div>

            {error && <p className="text-wine text-xs mb-2">{error}</p>}
            <PrimaryButton className="w-full" disabled={!form.title.trim() || !form.event_date}>{form.id ? '更新する' : '登録する'}</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
