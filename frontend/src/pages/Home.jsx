import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { daysUntil, formatDateJa, formatYen, currentMonth, formatHm, EVENT_ICONS } from '../util'
import { Card, OshiAvatar, Empty, SectionTitle, Loading, ProgressBar } from '../components/ui'

// 予定1件の控えめな行表示（今日の予定・直近の予定で共通）
function ScheduleRow({ s, badge, accentBorder = false }) {
  return (
    <div className={`bg-paper-card border rounded-2xl px-4 py-2.5 flex items-center gap-2 ${accentBorder ? 'border-wine/40' : 'border-paper-line/60'}`}>
      <span className="text-lg">{EVENT_ICONS[s.event_type] || '📌'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          {s.title}
          {!s.is_own && <span className="text-[10px] text-ink-soft">（{s.owner_name}）</span>}
        </p>
        <p className="text-[11px] text-ink-soft">
          {accentBorder
            ? (formatHm(s.start_time) ? `${formatHm(s.start_time)}〜` : '終日')
            : formatDateJa(s.event_date)}
          {s.oshi_name ? `・${s.oshi_name}` : ''}
        </p>
      </div>
      <span className={`font-bold text-xs shrink-0 rounded-full px-2.5 py-1 ${accentBorder ? 'bg-wine text-white' : 'bg-paper text-ink-soft'}`}>
        {badge}
      </span>
    </div>
  )
}

// トップ画面：次のイベントまでのカウントダウン＋貯金状況＋今月のサマリー
export default function Home({ user }) {
  const [schedules, setSchedules] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [stats, setStats] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  useEffect(() => {
    api('/schedules').then(setSchedules).catch(console.error).finally(() => setLoading(false))
    api('/oshi').then(setOshiList).catch(console.error)
    api('/stats/summary').then(setStats).catch(console.error)
    api('/events').then(setEvents).catch(console.error)
  }, [])

  // 第12弾：今日の予定はすべて表示し、それとは別に「今日より後」の直近予定を最大3件表示する
  const todays = schedules.filter((s) => daysUntil(s.event_date) === 0)
  const future = schedules.filter((s) => daysUntil(s.event_date) > 0).slice(0, 3)
  const next = future[0] // 直近の予定のうち一番近いものだけアクセントカラーで強調（既存要件を踏襲）
  const monthTotal = stats?.monthly.find((m) => m.month === currentMonth())?.total || 0

  // 貯金目標が設定されているイベントのうち、最も開催が近いもの（「いちばん近い予定」と同じ考え方）
  const savingsEvent = events.find((ev) => ev.joined && ev.savings_goal != null && daysUntil(ev.event_date) >= 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">こんにちは、<span className="font-bold text-ink">{user.display_name || user.username}</span> さん</p>

      {/* 予定：今日の予定（全件）＋今日より後の直近予定（最大3件・一番近いものだけワインレッドで強調） */}
      {loading ? (
        <Card><Loading label="読み込み中…" /></Card>
      ) : todays.length === 0 && !next ? (
        <Card><Empty icon="📅" message={'今後の予定がありません。\nカレンダーやイベントから登録しましょう！'} /></Card>
      ) : (
        <div className="space-y-2">
          {/* 今日の予定：件数の上限なしですべて表示 */}
          {todays.length > 0 && (
            <>
              <p className="text-xs font-bold text-wine">📌 今日の予定（{todays.length}件）</p>
              {todays.map((s) => <ScheduleRow key={s.id} s={s} badge="本日" accentBorder />)}
            </>
          )}

          {/* 直近の予定：一番近い1件はカウントダウンつきの強調カード */}
          {next && (
            <>
              {todays.length > 0 && <p className="text-xs font-bold text-wine pt-1">🗓️ 直近の予定</p>}
              <div className="rounded-3xl bg-wine text-white p-5 shadow-lg relative overflow-hidden">
                <p className="text-xs opacity-80">{EVENT_ICONS[next.event_type] || '📌'} いちばん近い予定</p>
                <p className="font-bold text-lg mt-1 break-words">{next.title}</p>
                <p className="text-xs opacity-80 mt-0.5">
                  {formatDateJa(next.event_date)}{next.oshi_name ? `・${next.oshi_name}` : ''}
                </p>
                <p className="text-center mt-4 mb-1">
                  あと <span className="text-6xl font-black align-middle">{daysUntil(next.event_date)}</span> 日
                </p>
              </div>

              {/* 2件目以降は控えめな配色で一覧表示 */}
              {future.slice(1).map((s) => (
                <ScheduleRow key={s.id} s={s} badge={`あと${daysUntil(s.event_date)}日`} />
              ))}
            </>
          )}
        </div>
      )}

      {/* 貯金状況：目標つきイベントのうち最も開催が近いもの。タップで入出金モーダルへ */}
      {savingsEvent && (
        <button onClick={() => nav(`/events?focus=${savingsEvent.id}&savings=1`)} className="w-full text-left">
          <Card>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-ink-soft truncate">🐷 {savingsEvent.name} の貯金</span>
              <span className="font-bold text-wine shrink-0 ml-2">{formatYen(savingsEvent.saved_amount)} / {formatYen(savingsEvent.savings_goal)}</span>
            </div>
            <ProgressBar value={savingsEvent.saved_amount} max={savingsEvent.savings_goal} />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-ink-soft">
                {savingsEvent.saved_amount >= savingsEvent.savings_goal
                  ? '🎉 目標達成！'
                  : `目標まで あと ${formatYen(Math.max(0, savingsEvent.savings_goal - savingsEvent.saved_amount))}`}
              </span>
              <span className="text-[10px] text-wine underline">貯金・引き出し ›</span>
            </div>
          </Card>
        </button>
      )}

      {/* サマリー */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs text-ink-soft">今月の推し活費</p>
          <p className="text-xl font-black text-wine mt-1">{formatYen(monthTotal)}</p>
          <Link to="/records" className="text-[11px] text-wine/70">家計簿を見る →</Link>
        </Card>
        <Card>
          <p className="text-xs text-ink-soft">推している人</p>
          <p className="text-xl font-black text-wine mt-1">{oshiList.length} 人</p>
          <Link to="/oshi" className="text-[11px] text-wine/70">推しを見る →</Link>
        </Card>
      </div>

      {/* クイックリンク */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/records"><Card className="text-center"><div className="text-2xl">💰</div><p className="text-xs mt-1 font-bold">家計簿</p></Card></Link>
        <Link to="/goods"><Card className="text-center"><div className="text-2xl">🎁</div><p className="text-xs mt-1 font-bold">グッズ</p></Card></Link>
      </div>

      {/* 推し一覧 */}
      {oshiList.length > 0 && (
        <Card>
          <SectionTitle>わたしの推し</SectionTitle>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {oshiList.map((o) => (
              <Link key={o.id} to={o.oshi_master_id ? `/oshi/${o.oshi_master_id}` : '/oshi'} className="flex flex-col items-center gap-1 shrink-0">
                <OshiAvatar oshi={o} />
                <span className="text-[11px] text-ink-soft max-w-14 truncate">{o.name}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

    </div>
  )
}
