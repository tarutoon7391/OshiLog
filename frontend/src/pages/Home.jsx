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

      {/* カウントダウン */}
      {next ? (
        <div className="rounded-3xl bg-wine text-white p-5 shadow-lg relative overflow-hidden">
          <p className="text-xs opacity-80">{EVENT_ICONS[next.event_type] || '📌'} 次の予定</p>
          <p className="font-bold text-lg mt-1">{next.title}</p>
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

      {/* このあとの予定 */}
      {upcoming.length > 1 && (
        <Card>
          <SectionTitle>このあとの予定</SectionTitle>
          <ul className="divide-y divide-paper-line/60">
            {upcoming.slice(1, 4).map((s) => (
              <li key={s.id} className="py-2 flex items-center gap-2 text-sm">
                <span>{EVENT_ICONS[s.event_type] || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{s.title}{!s.is_own && <span className="text-[10px] text-ink-soft">（{s.owner_name}）</span>}</p>
                  <p className="text-[11px] text-ink-soft">{formatDateJa(s.event_date)}</p>
                </div>
                <span className="text-wine font-bold text-xs shrink-0">あと{daysUntil(s.event_date)}日</span>
              </li>
            ))}
          </ul>
          <Link to="/calendar" className="block text-right text-[11px] text-wine/70 mt-1">カレンダーへ →</Link>
        </Card>
      )}
    </div>
  )
}
