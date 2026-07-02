import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { daysUntil, formatDateJa, formatYen, currentMonth, EVENT_ICONS } from '../util'
import { Card, OshiAvatar, Empty, SectionTitle } from '../components/ui'

// トップ画面：次のイベントまでのカウントダウン＋今月のサマリー
export default function Home({ user }) {
  const [schedules, setSchedules] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api('/schedules').then(setSchedules).catch(console.error)
    api('/oshi').then(setOshiList).catch(console.error)
    api('/stats/summary').then(setStats).catch(console.error)
  }, [])

  const upcoming = schedules.filter((s) => daysUntil(s.event_date) >= 0)
  const next = upcoming[0]
  const monthTotal = stats?.monthly.find((m) => m.month === currentMonth())?.total || 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">こんにちは、<span className="font-bold text-ink">{user.display_name || user.username}</span> さん</p>

      {/* 今後の予定をすべて上部にまとめて表示（一番直近だけワインレッドで強調） */}
      {next ? (
        <div className="space-y-2">
          <div className="rounded-3xl bg-wine text-white p-5 shadow-lg relative overflow-hidden">
            <p className="text-xs opacity-80">{EVENT_ICONS[next.event_type] || '📌'} いちばん近い予定</p>
            <p className="font-bold text-lg mt-1 break-words">{next.title}</p>
            <p className="text-xs opacity-80 mt-0.5">
              {formatDateJa(next.event_date)}{next.oshi_name ? `・${next.oshi_name}` : ''}
            </p>
            <p className="text-center mt-4 mb-1">
              {daysUntil(next.event_date) === 0 ? (
                <span className="text-3xl font-black">🎉 本日です！</span>
              ) : (
                <>あと <span className="text-6xl font-black align-middle">{daysUntil(next.event_date)}</span> 日</>
              )}
            </p>
          </div>

          {/* 2件目以降は控えめな配色で一覧表示 */}
          {upcoming.slice(1).map((s) => (
            <div key={s.id} className="bg-paper-card border border-paper-line/60 rounded-2xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-lg">{EVENT_ICONS[s.event_type] || '📌'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  {s.title}
                  {!s.is_own && <span className="text-[10px] text-ink-soft">（{s.owner_name}）</span>}
                </p>
                <p className="text-[11px] text-ink-soft">{formatDateJa(s.event_date)}{s.oshi_name ? `・${s.oshi_name}` : ''}</p>
              </div>
              <span className="text-ink-soft font-bold text-xs shrink-0 bg-paper rounded-full px-2.5 py-1">
                {daysUntil(s.event_date) === 0 ? '本日' : `あと${daysUntil(s.event_date)}日`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Card><Empty icon="📅" message={'今後の予定がありません。\nカレンダーやイベントから登録しましょう！'} /></Card>
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
              <Link key={o.id} to="/oshi" className="flex flex-col items-center gap-1 shrink-0">
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
