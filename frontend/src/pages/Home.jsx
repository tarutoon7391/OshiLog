import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { daysUntil, formatDateJa, formatYen, currentMonth, formatHm, EVENT_ICONS, importanceColor, importanceMark } from '../util'
import { Card, OshiAvatar, Empty, Loading, ProgressBar, PrimaryButton } from '../components/ui'

// 予定1件の控えめな行表示（今日の予定・直近の予定モーダルで共通）。
// 第14弾：重要度が設定されたイベント予定は縁取り色と星印で目立たせる
function ScheduleRow({ s, badge, accentBorder = false }) {
  const impColor = importanceColor(s.event_importance)
  return (
    <div className={`bg-paper-card border rounded-2xl px-4 py-2.5 flex items-center gap-2 ${accentBorder ? 'border-wine/40' : 'border-paper-line/60'}`}
      style={impColor ? { borderColor: impColor, borderWidth: 2 } : undefined}>
      <span className="text-lg">{EVENT_ICONS[s.event_type] || '📌'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          {importanceMark(s.event_importance) && <span className="mr-0.5">{importanceMark(s.event_importance)}</span>}
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

// 第13弾：果実タップ→その場で拡大してモーダルになるパネル。
// 第7弾のカレンダーのズーム遷移（DayZoomPanel）と同じ考え方：
// タップした果実の中心を transform-origin にして拡大し、閉じるときは逆再生で縮小する。
function FruitZoomModal({ title, origin, onClose, children }) {
  const [phase, setPhase] = useState('enter') // enter（縮小状態）→ open → closing
  useEffect(() => {
    // 初期の縮小状態を一度描画してから open に切り替え、transitionを発火させる
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open')))
    return () => cancelAnimationFrame(id)
  }, [])
  const close = () => { setPhase('closing'); setTimeout(onClose, 240) }
  const shrunk = phase !== 'open'
  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* 背景を暗くして、木の部分は操作できないようにする */}
      <div className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${shrunk ? 'opacity-0' : 'opacity-100'}`} onClick={close} />
      <div className="fruit-panel absolute inset-0 flex items-center justify-center px-5 pointer-events-none"
        style={{ transformOrigin: origin || '50% 40%', transform: shrunk ? 'scale(0.1)' : 'scale(1)', opacity: shrunk ? 0 : 1 }}>
        <div className="pointer-events-auto w-full max-w-sm bg-paper-card rounded-3xl shadow-xl border border-paper-line/60 p-4 max-h-[75vh] overflow-y-auto scroll-area">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg text-wine">{title}</h2>
            <button onClick={close} className="text-ink-soft text-2xl leading-none px-2">×</button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

// 木に実る果実（タップで拡大→モーダル）。position は木コンテナに対する%座標
function Fruit({ icon, label, value, x, y, size = 58, tone = 'paper', delay = 0, onOpen }) {
  const toneClass = {
    wine: 'bg-wine text-white border-wine-dark/70',
    gold: 'bg-paper-card text-ink border-gold/70',
    paper: 'bg-paper-card text-ink border-wine/40',
  }[tone]
  const tap = (e) => {
    // タップした果実の中心座標をモーダルの拡大起点として渡す
    const r = e.currentTarget.getBoundingClientRect()
    onOpen(`${r.left + r.width / 2}px ${r.top + r.height / 2}px`)
  }
  return (
    <button onClick={tap} aria-label={label}
      className="absolute flex flex-col items-center"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
      <span className="fruit-bob flex flex-col items-center" style={{ animationDelay: `${delay}s` }}>
        <span className={`press rounded-full border-2 shadow-md flex flex-col items-center justify-center ${toneClass}`}
          style={{ width: size, height: size }}>
          <span style={{ fontSize: Math.round(size * 0.36) }} className="leading-none">{icon}</span>
          {value != null && <span className="text-[9px] font-bold leading-tight mt-0.5 px-1 truncate max-w-full">{value}</span>}
        </span>
        <span className="text-[10px] text-ink font-bold mt-1 bg-paper-card/85 border border-paper-line/50 rounded-full px-1.5 leading-tight whitespace-nowrap">
          {label}
        </span>
      </span>
    </button>
  )
}

// 手帳の余白に描いた落書き風の木（線画SVG）。写実的にはせず、ラフな2本線の幹＋
// もこもこした樹冠の輪郭＋葉っぱの走り書きだけで表現する。色は紙になじむ低彩度のみ。
function DoodleTree() {
  return (
    <svg viewBox="0 0 390 440" className="absolute inset-0 w-full h-full" aria-hidden="true" fill="none">
      {/* 地面のライン＋草 */}
      <path d="M28 421 q 34 -7 68 0 t 68 0 t 68 0 t 68 0 t 62 0" stroke="#8a7a6b" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <path d="M84 419 q 3 -10 7 -13 M95 419 q 1 -8 6 -12 M292 419 q 3 -9 8 -12 M304 419 q 1 -8 5 -11" stroke="#5e7a5b" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      {/* 幹（フリーハンド風の2本線） */}
      <path d="M182 420 C 179 385 187 350 180 315 C 175 288 165 268 148 250" stroke="#6b543f" strokeWidth="3.5" strokeLinecap="round" opacity="0.75" />
      <path d="M208 420 C 211 382 203 348 209 314 C 214 287 226 268 243 252" stroke="#6b543f" strokeWidth="3.5" strokeLinecap="round" opacity="0.75" />
      {/* 枝：各果実の位置へ向かって伸ばす */}
      <path d="M192 320 C 194 290 194 250 195 205 C 195 170 195 135 195 108" stroke="#6b543f" strokeWidth="3" strokeLinecap="round" opacity="0.65" />
      <path d="M160 258 C 135 230 108 190 90 148" stroke="#6b543f" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M152 256 C 118 244 80 232 56 222" stroke="#6b543f" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M238 256 C 268 224 292 176 305 138" stroke="#6b543f" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M242 258 C 276 240 312 222 332 212" stroke="#6b543f" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M165 268 C 152 260 140 254 133 250" stroke="#6b543f" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M228 266 C 238 260 248 256 254 253" stroke="#6b543f" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      {/* 樹冠（もこもこの輪郭を1周） */}
      <path d="M60 190 C 40 150 60 105 100 90 C 110 55 160 38 195 52 C 230 30 285 42 300 80 C 340 92 358 140 336 178 C 352 216 330 258 292 262 C 280 292 236 305 205 288 C 170 308 120 298 104 268 C 68 262 48 226 60 190 Z"
        stroke="#5e7a5b" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      {/* 葉っぱの走り書き */}
      <path d="M146 158 q 9 -16 18 0 q -9 12 -18 0" stroke="#5e7a5b" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M258 172 q 9 -16 18 0 q -9 12 -18 0" stroke="#5e7a5b" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M100 186 q 9 -16 18 0 q -9 12 -18 0" stroke="#5e7a5b" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      {/* 手帳の落書きらしいワンポイント（ハートと渦巻き） */}
      <path d="M328 62 c -3 -6 -12 -4 -12 3 c 0 6 8 9 12 13 c 4 -4 12 -7 12 -13 c 0 -7 -9 -9 -12 -3" stroke="#96324e" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <path d="M44 84 c 10 -8 24 -2 22 8 c -2 8 -14 8 -16 1 c -1 -5 5 -8 9 -6" stroke="#8a7a6b" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

// トップ画面（第13弾）：手描き風の木に、ホームの各要素を「果実」として実らせる。
// 果実タップ→その場で拡大→モーダル表示（ページ遷移なし）。
// 各要素のデータ取得ロジックは従来のまま（表示のされ方だけを変更）。
export default function Home({ user }) {
  const [schedules, setSchedules] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [stats, setStats] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null) // { key, origin }
  const nav = useNavigate()

  useEffect(() => {
    api('/schedules').then(setSchedules).catch(console.error).finally(() => setLoading(false))
    api('/oshi').then(setOshiList).catch(console.error)
    api('/stats/summary').then(setStats).catch(console.error)
    api('/events').then(setEvents).catch(console.error)
  }, [])

  // 第12弾のロジックを踏襲：今日の予定は全件、今日より後の直近予定は最大3件
  const todays = schedules.filter((s) => daysUntil(s.event_date) === 0)
  const future = schedules.filter((s) => daysUntil(s.event_date) > 0).slice(0, 3)
  const next = future[0]
  const nearest = todays[0] || next || null
  const monthTotal = stats?.monthly.find((m) => m.month === currentMonth())?.total || 0

  // 貯金目標が設定されているイベントのうち、最も開催が近いもの
  const savingsEvent = events.find((ev) => ev.joined && ev.savings_goal != null && daysUntil(ev.event_date) >= 0)

  const openFruit = (key) => (origin) => setOpen({ key, origin })
  const close = () => setOpen(null)

  // 果実のバッジ表示（カウントダウン・件数・金額など）
  const nearestValue = nearest ? (todays.length ? '本日!' : `あと${daysUntil(next.event_date)}日`) : 'ー'
  const listCount = todays.length + future.length

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-soft">こんにちは、<span className="font-bold text-ink">{user.display_name || user.username}</span> さん</p>

      {loading ? (
        <Card><Loading label="読み込み中…" /></Card>
      ) : (
        <>
          <p className="text-[10px] text-ink-soft">🍎 木になっている果実をタップすると、それぞれの内容が開きます</p>

          {/* 手描き風の木＋果実。スマホ画面に収まる縦横比で固定 */}
          <div className="relative w-full aspect-[39/44]">
            <DoodleTree />
            <Fruit icon={nearest ? (EVENT_ICONS[nearest.event_type] || '📌') : '📅'} label="いちばん近い予定" value={nearestValue}
              x={50} y={21} size={78} tone="wine" delay={0} onOpen={openFruit('next')} />
            <Fruit icon="🗓️" label="今日・直近" value={`${listCount}件`}
              x={21} y={30} size={62} delay={0.4} onOpen={openFruit('list')} />
            {savingsEvent && (
              <Fruit icon="🐷" label="貯金" value={`${Math.min(100, Math.round((savingsEvent.saved_amount / savingsEvent.savings_goal) * 100))}%`}
                x={79} y={28} size={64} tone="gold" delay={0.8} onOpen={openFruit('savings')} />
            )}
            <Fruit icon="🎁" label="グッズ" x={50} y={43} size={56} delay={1.2} onOpen={openFruit('goods')} />
            <Fruit icon="💰" label="今月の推し活費" value={formatYen(monthTotal)}
              x={11.5} y={49} size={60} delay={0.6} onOpen={openFruit('month')} />
            <Fruit icon="⭐" label="推している人" value={`${oshiList.length}人`}
              x={88} y={47} size={58} delay={1.0} onOpen={openFruit('oshiCount')} />
            <Fruit icon="💗" label="わたしの推し"
              x={33} y={56} size={58} tone="gold" delay={0.2} onOpen={openFruit('myOshi')} />
            <Fruit icon="📒" label="家計簿"
              x={66} y={57} size={56} delay={1.4} onOpen={openFruit('records')} />
          </div>
        </>
      )}

      {/* ===== 果実のモーダル（タップした果実から拡大表示） ===== */}
      {open?.key === 'next' && (
        <FruitZoomModal title="いちばん近い予定" origin={open.origin} onClose={close}>
          {nearest ? (
            <div className="rounded-3xl bg-wine text-white p-5">
              <p className="font-bold text-lg break-words">{EVENT_ICONS[nearest.event_type] || '📌'} {nearest.title}</p>
              <p className="text-xs opacity-80 mt-0.5">
                {formatDateJa(nearest.event_date)}{nearest.oshi_name ? `・${nearest.oshi_name}` : ''}
              </p>
              <p className="text-center mt-4 mb-1">
                {todays.length > 0 ? (
                  <span className="text-3xl font-black">🎉 本日です！</span>
                ) : (
                  <>あと <span className="text-6xl font-black align-middle">{daysUntil(nearest.event_date)}</span> 日</>
                )}
              </p>
            </div>
          ) : (
            <Empty icon="📅" message={'今後の予定がありません。\nカレンダーやイベントから登録しましょう！'} />
          )}
        </FruitZoomModal>
      )}

      {open?.key === 'list' && (
        <FruitZoomModal title="今日・直近の予定" origin={open.origin} onClose={close}>
          {listCount === 0 ? (
            <Empty icon="📅" message={'今後の予定がありません。\nカレンダーやイベントから登録しましょう！'} />
          ) : (
            <div className="space-y-2">
              {todays.length > 0 && (
                <>
                  <p className="text-xs font-bold text-wine">📌 今日の予定（{todays.length}件）</p>
                  {todays.map((s) => <ScheduleRow key={s.id} s={s} badge="本日" accentBorder />)}
                </>
              )}
              {future.length > 0 && (
                <>
                  <p className="text-xs font-bold text-wine pt-1">🗓️ 直近の予定</p>
                  {future.map((s) => <ScheduleRow key={s.id} s={s} badge={`あと${daysUntil(s.event_date)}日`} />)}
                </>
              )}
              <PrimaryButton className="w-full mt-2" onClick={() => nav('/calendar')}>カレンダーを開く</PrimaryButton>
            </div>
          )}
        </FruitZoomModal>
      )}

      {open?.key === 'savings' && savingsEvent && (
        <FruitZoomModal title="貯金の状況" origin={open.origin} onClose={close}>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-ink-soft truncate">🐷 {savingsEvent.name} の貯金</span>
            <span className="font-bold text-wine shrink-0 ml-2">{formatYen(savingsEvent.saved_amount)} / {formatYen(savingsEvent.savings_goal)}</span>
          </div>
          <ProgressBar value={savingsEvent.saved_amount} max={savingsEvent.savings_goal} />
          <p className="text-[10px] text-ink-soft mt-1">
            {savingsEvent.saved_amount >= savingsEvent.savings_goal
              ? '🎉 目標達成！'
              : `目標まで あと ${formatYen(Math.max(0, savingsEvent.savings_goal - savingsEvent.saved_amount))}`}
          </p>
          <PrimaryButton className="w-full mt-3" onClick={() => nav(`/events?focus=${savingsEvent.id}&savings=1`)}>
            貯金・引き出しをする
          </PrimaryButton>
        </FruitZoomModal>
      )}

      {open?.key === 'month' && (
        <FruitZoomModal title="今月の推し活費" origin={open.origin} onClose={close}>
          <p className="text-xs text-ink-soft">今月の推し活費（参戦記録の合計）</p>
          <p className="text-3xl font-black text-wine mt-1">{formatYen(monthTotal)}</p>
          <PrimaryButton className="w-full mt-4" onClick={() => nav('/records')}>家計簿を見る</PrimaryButton>
        </FruitZoomModal>
      )}

      {open?.key === 'oshiCount' && (
        <FruitZoomModal title="推している人" origin={open.origin} onClose={close}>
          <p className="text-xs text-ink-soft">いま推している人</p>
          <p className="text-3xl font-black text-wine mt-1">{oshiList.length} 人</p>
          <PrimaryButton className="w-full mt-4" onClick={() => nav('/oshi')}>推しをさがす・見る</PrimaryButton>
        </FruitZoomModal>
      )}

      {open?.key === 'myOshi' && (
        <FruitZoomModal title="わたしの推し" origin={open.origin} onClose={close}>
          {oshiList.length === 0 ? (
            <Empty icon="⭐" message="まだ推しを登録していません" />
          ) : (
            <div className="flex gap-3 flex-wrap">
              {oshiList.map((o) => (
                <button key={o.id} onClick={() => nav(o.oshi_master_id ? `/oshi/${o.oshi_master_id}` : '/oshi')}
                  className="flex flex-col items-center gap-1 w-16">
                  <OshiAvatar oshi={o} />
                  <span className="text-[11px] text-ink-soft max-w-16 truncate">{o.name}</span>
                </button>
              ))}
            </div>
          )}
          <PrimaryButton className="w-full mt-4" onClick={() => nav('/oshi')}>推しを追加する</PrimaryButton>
        </FruitZoomModal>
      )}

      {open?.key === 'records' && (
        <FruitZoomModal title="家計簿" origin={open.origin} onClose={close}>
          <p className="text-sm text-ink">参戦記録と支出をつけて、月別・推し別のグラフでふりかえられます。</p>
          <p className="text-xs text-ink-soft mt-1">今月はこれまでに {formatYen(monthTotal)} 使っています。</p>
          <PrimaryButton className="w-full mt-4" onClick={() => nav('/records')}>家計簿を開く</PrimaryButton>
        </FruitZoomModal>
      )}

      {open?.key === 'goods' && (
        <FruitZoomModal title="グッズ" origin={open.origin} onClose={close}>
          <p className="text-sm text-ink">集めたグッズを写真つきでコレクションできます。</p>
          <PrimaryButton className="w-full mt-4" onClick={() => nav('/goods')}>グッズを開く</PrimaryButton>
        </FruitZoomModal>
      )}
    </div>
  )
}
