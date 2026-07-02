import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { daysUntil, formatDateJa, formatYen, currentMonth, EVENT_ICONS } from '../util'
import { Card, OshiAvatar, Empty } from '../components/ui'

// トップ画面：次のイベントまでのカウントダウン＋今月のサマリー
export default function Home() {
  const [schedules, setSchedules] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api('/schedules').then(setSchedules).catch(console.error)
    api('/oshi').then(setOshiList).catch(console.error)
    api('/stats/summary').then(setStats).catch(console.error)
  }, [])

  // 今日以降の予定（サーバーが日付昇順で返す）
  const upcoming = schedules.filter((s) => daysUntil(s.event_date) >= 0)
  const next = upcoming[0]
  const monthTotal = stats?.monthly.find((m) => m.month === currentMonth())?.total || 0

  return (
    <div className="space-y-4">
      {/* カウントダウンカード */}
      {next ? (
        <div className="rounded-3xl bg-gradient-to-br from-pink-500 to-fuchsia-600 text-white p-5 shadow-lg">
          <p className="text-xs opacity-80">{EVENT_ICONS[next.event_type] || '📌'} 次のイベント</p>
          <p className="font-bold text-lg mt-1">{next.title}</p>
          <p className="text-xs opacity-80 mt-0.5">
            {formatDateJa(next.event_date)}
            {next.oshi_name ? `・${next.oshi_name}` : ''}
          </p>
          <p className="text-center mt-4 mb-1">
            {daysUntil(next.event_date) === 0 ? (
              <span className="text-3xl font-black">🎉 本日です！</span>
            ) : (
              <>
                あと <span className="text-6xl font-black align-middle">{daysUntil(next.event_date)}</span> 日
              </>
            )}
          </p>
        </div>
      ) : (
        <Card>
          <Empty icon="📅" message={'今後の予定がありません。\n「予定」からイベントを登録しましょう！'} />
        </Card>
      )}

      {/* 今月の支出と推しの数 */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs text-gray-500">今月の推し活費</p>
          <p className="text-xl font-black text-pink-600 mt-1">{formatYen(monthTotal)}</p>
          <Link to="/records" className="text-[11px] text-pink-400">記録を見る →</Link>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">推している人</p>
          <p className="text-xl font-black text-pink-600 mt-1">{oshiList.length} 人</p>
          <Link to="/oshi" className="text-[11px] text-pink-400">推しを管理 →</Link>
        </Card>
      </div>

      {/* 推し一覧（アイコンの横並び） */}
      {oshiList.length > 0 && (
        <Card>
          <p className="text-sm font-bold mb-3">わたしの推し</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {oshiList.map((o) => (
              <Link key={o.id} to="/oshi" className="flex flex-col items-center gap-1 shrink-0">
                <OshiAvatar oshi={o} />
                <span className="text-[11px] text-gray-600 max-w-14 truncate">{o.name}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* 直近の予定リスト */}
      {upcoming.length > 1 && (
        <Card>
          <p className="text-sm font-bold mb-2">そのあとの予定</p>
          <ul className="divide-y divide-pink-50">
            {upcoming.slice(1, 4).map((s) => (
              <li key={s.id} className="py-2 flex items-center gap-2 text-sm">
                <span>{EVENT_ICONS[s.event_type] || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{s.title}</p>
                  <p className="text-[11px] text-gray-400">{formatDateJa(s.event_date)}</p>
                </div>
                <span className="text-pink-500 font-bold text-xs shrink-0">あと{daysUntil(s.event_date)}日</span>
              </li>
            ))}
          </ul>
          <Link to="/schedule" className="block text-right text-[11px] text-pink-400 mt-1">すべて見る →</Link>
        </Card>
      )}
    </div>
  )
}
