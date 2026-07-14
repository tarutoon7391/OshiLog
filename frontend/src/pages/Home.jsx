import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { daysUntil, formatDateJa, formatYen, currentMonth, formatHm, EVENT_ICONS, importanceColor, importanceMark } from '../util'
import { Card, OshiAvatar, Empty, Loading, ProgressBar, PrimaryButton, CountUp } from '../components/ui'

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

// 木に実る果実（タップで拡大→モーダル）。position は木コンテナに対する%座標。
// 第18弾：hanging（枝から糸で吊るされた状態）では丸い果実→角丸アイコンに変わり、
// 糸の上端を支点にゆっくり左右へ揺れる。left/top のトランジションで垂れ下がりを表現する
function Fruit({ icon, label, value, x, y, size = 58, color = '#96324e', delay = 0, hanging = false, moveDelay = 0, onOpen }) {
  const tap = (e) => {
    e.stopPropagation() // 木タップ（実を吊るす／戻す）と干渉しないようにする
    // タップした果実の中心座標をモーダルの拡大起点として渡す
    const r = e.currentTarget.getBoundingClientRect()
    onOpen(`${r.left + r.width / 2}px ${r.top + r.height / 2}px`)
  }
  return (
    <button onClick={tap} aria-label={label}
      className="fruit-move absolute flex flex-col items-center"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', transitionDelay: `${moveDelay}s` }}>
      {/* 吊るされたら揺れ方を「上下の風揺れ」→「糸を支点にした振り子」に切り替える。
          負のdelayで揺れの位相を実ごとにずらし、全体が同時に揺れないようにする */}
      <span className={`${hanging ? 'fruit-sway' : 'fruit-bob'} flex flex-col items-center`}
        style={{ animationDelay: hanging ? `-${delay}s` : `${delay}s` }}>
        <span className="press fruit-face shadow-md flex flex-col items-center justify-center text-white"
          style={{ width: size, height: size, backgroundColor: color,
            borderRadius: hanging ? '30%' : '9999px', border: '2px solid rgba(255, 253, 248, 0.85)' }}>
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

// 手帳の余白に描いた落書き風の木。第18弾で線画のみ→柔らかい水彩画風に変更：
// 半透明の色面（緑の葉・茶色い幹）を重ねてにじみを表現し、その上に従来のラフな線を残す。
// 蛍光色は使わず、紙になじむ落ち着いた配色のみ。night=true で夜（月と星）の配色になる。
function DoodleTree({ night = false }) {
  // 昼＝優しい若葉の水彩、夜＝月明かりに照らされた深い緑
  const c = night
    ? { leaf1: '#56715f', leaf2: '#6b8873', leaf3: '#46604f', leafLine: '#a7c0ab',
        trunkFill: '#7a6650', trunkLine: '#bfa07e', ground: '#b8c2d4', grass: '#9db8a5', groundWash: '#5c6c62' }
    : { leaf1: '#9dbb90', leaf2: '#c3d5ae', leaf3: '#7fa377', leafLine: '#5e7a5b',
        trunkFill: '#a8825d', trunkLine: '#6b543f', ground: '#8a7a6b', grass: '#5e7a5b', groundWash: '#a3b384' }
  return (
    <svg viewBox="0 0 390 440" className="absolute inset-0 w-full h-full" aria-hidden="true" fill="none">
      {/* 空のワンポイント：昼は水彩のお日さま＋ハート、夜は三日月と星 */}
      {night ? (
        <>
          <mask id="doodle-moon">
            <circle cx="332" cy="60" r="20" fill="#fff" />
            <circle cx="323" cy="53" r="16" fill="#000" />
          </mask>
          <circle cx="332" cy="60" r="20" fill="#e9dcae" opacity="0.9" mask="url(#doodle-moon)" />
          <path d="M46 48 l2.2 6.6 6.6 2.2 -6.6 2.2 -2.2 6.6 -2.2 -6.6 -6.6 -2.2 6.6 -2.2 Z" fill="#e9dcae" opacity="0.75" />
          <path d="M92 24 l1.8 5.4 5.4 1.8 -5.4 1.8 -1.8 5.4 -1.8 -5.4 -5.4 -1.8 5.4 -1.8 Z" fill="#e9dcae" opacity="0.6" />
          <path d="M282 26 l1.8 5.4 5.4 1.8 -5.4 1.8 -1.8 5.4 -1.8 -5.4 -5.4 -1.8 5.4 -1.8 Z" fill="#e9dcae" opacity="0.65" />
          <path d="M358 118 l1.6 4.8 4.8 1.6 -4.8 1.6 -1.6 4.8 -1.6 -4.8 -4.8 -1.6 4.8 -1.6 Z" fill="#e9dcae" opacity="0.55" />
        </>
      ) : (
        <>
          <circle cx="52" cy="60" r="24" fill="#e2c46a" opacity="0.16" />
          <circle cx="52" cy="60" r="15" fill="#e2c46a" opacity="0.5" />
          <path d="M328 62 c -3 -6 -12 -4 -12 3 c 0 6 8 9 12 13 c 4 -4 12 -7 12 -13 c 0 -7 -9 -9 -12 -3" stroke="#96324e" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
        </>
      )}
      {/* 地面の水彩の色面＋ライン＋草 */}
      <ellipse cx="195" cy="420" rx="155" ry="12" fill={c.groundWash} opacity="0.3" />
      <path d="M28 421 q 34 -7 68 0 t 68 0 t 68 0 t 68 0 t 62 0" stroke={c.ground} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <path d="M84 419 q 3 -10 7 -13 M95 419 q 1 -8 6 -12 M292 419 q 3 -9 8 -12 M304 419 q 1 -8 5 -11" stroke={c.grass} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      {/* 樹冠の水彩塗り：ずらした色面を透かして重ね、絵の具のにじみを出す */}
      <ellipse cx="195" cy="168" rx="132" ry="108" fill={c.leaf1} opacity="0.5" />
      <ellipse cx="118" cy="182" rx="74" ry="68" fill={c.leaf3} opacity="0.42" transform="rotate(-8 118 182)" />
      <ellipse cx="272" cy="158" rx="76" ry="70" fill={c.leaf2} opacity="0.48" transform="rotate(6 272 158)" />
      <ellipse cx="198" cy="96" rx="88" ry="56" fill={c.leaf2} opacity="0.5" />
      <ellipse cx="150" cy="122" rx="48" ry="36" fill="#ffffff" opacity={night ? 0.05 : 0.1} />
      {/* 幹の水彩塗り（2本線の内側を淡く埋める） */}
      <path d="M182 420 C 179 385 187 350 180 315 C 175 288 165 268 148 250 C 178 238 214 238 243 252 C 226 268 214 287 209 314 C 203 348 211 382 208 420 Z"
        fill={c.trunkFill} opacity="0.55" />
      {/* 幹（フリーハンド風の2本線） */}
      <path d="M182 420 C 179 385 187 350 180 315 C 175 288 165 268 148 250" stroke={c.trunkLine} strokeWidth="3.5" strokeLinecap="round" opacity="0.75" />
      <path d="M208 420 C 211 382 203 348 209 314 C 214 287 226 268 243 252" stroke={c.trunkLine} strokeWidth="3.5" strokeLinecap="round" opacity="0.75" />
      {/* 枝：各果実の位置へ向かって伸ばす */}
      <path d="M192 320 C 194 290 194 250 195 205 C 195 170 195 135 195 108" stroke={c.trunkLine} strokeWidth="3" strokeLinecap="round" opacity="0.65" />
      <path d="M160 258 C 135 230 108 190 90 148" stroke={c.trunkLine} strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M152 256 C 118 244 80 232 56 222" stroke={c.trunkLine} strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M238 256 C 268 224 292 176 305 138" stroke={c.trunkLine} strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M242 258 C 276 240 312 222 332 212" stroke={c.trunkLine} strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M165 268 C 152 260 140 254 133 250" stroke={c.trunkLine} strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M228 266 C 238 260 248 256 254 253" stroke={c.trunkLine} strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      {/* 樹冠（もこもこの輪郭を1周） */}
      <path d="M60 190 C 40 150 60 105 100 90 C 110 55 160 38 195 52 C 230 30 285 42 300 80 C 340 92 358 140 336 178 C 352 216 330 258 292 262 C 280 292 236 305 205 288 C 170 308 120 298 104 268 C 68 262 48 226 60 190 Z"
        stroke={c.leafLine} strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
      {/* 葉っぱの走り書き */}
      <path d="M146 158 q 9 -16 18 0 q -9 12 -18 0" stroke={c.leafLine} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <path d="M258 172 q 9 -16 18 0 q -9 12 -18 0" stroke={c.leafLine} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <path d="M100 186 q 9 -16 18 0 q -9 12 -18 0" stroke={c.leafLine} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
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
  // 第18弾：木タップで実が枝から糸で吊り下がる演出（第16弾の「実が落ちる」を置き換え）
  const [hanging, setHanging] = useState(false)
  const [shaking, setShaking] = useState(false)
  const nav = useNavigate()

  // 木（実以外の部分）をタップ：揺らして実を糸で吊るす。吊るした状態でもう一度タップすると実が木に戻る
  const tapTree = () => {
    if (shaking) return
    if (hanging) { setHanging(false); return }
    setShaking(true)
    setTimeout(() => setHanging(true), 220) // 揺れの途中で実が枝から垂れはじめる
    setTimeout(() => setShaking(false), 650)
  }

  // 第18弾：端末の現在時刻で昼（6:00〜18:00）と夜のデザインを切り替える
  const hour = new Date().getHours()
  const isNight = hour < 6 || hour >= 18

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

  // 第18弾：貯金目標が設定されている参加イベントの一覧（開催前→開催済みの順）
  const savingsEvents = [
    ...events.filter((ev) => ev.joined && ev.savings_goal != null && daysUntil(ev.event_date) >= 0),
    ...events.filter((ev) => ev.joined && ev.savings_goal != null && daysUntil(ev.event_date) < 0),
  ]

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
          <p className="text-[10px] text-ink-soft">
            {hanging
              ? '🧵 ぶら下がったアイコンをタップすると開きます・木をタップすると実が戻ります'
              : '🍎 果実をタップすると開きます・木をタップすると実が糸でぶら下がります'}
          </p>

          {/* 水彩画風の木＋果実。スマホ画面に収まる縦横比で固定。
              背景は昼＝明るい空、夜＝月と星の夜空（第18弾）。
              木の部分（実以外）をタップすると揺れて、実が枝から糸で吊り下がる */}
          <div className="relative w-full aspect-[39/44] rounded-3xl overflow-hidden" onClick={tapTree}
            style={{ background: isNight
              ? 'linear-gradient(to bottom, #3f4560 0%, #565c78 60%, #6f7389 100%)'
              : 'linear-gradient(to bottom, rgba(176, 208, 224, 0.5) 0%, rgba(232, 223, 206, 0) 65%)' }}>
            <div className={`absolute inset-0 ${shaking ? 'tree-shake' : ''}`}>
              <DoodleTree night={isNight} />
            </div>
            {(() => {
              // x, y ＝木になっている状態の位置。hang ＝吊るされたとき糸で垂れ下がる長さ（コンテナ高さ%）。
              // 糸の長さをそれぞれ変えて、全体がランダムでバランスの良い配置になるようにしている
              const fruitDefs = [
                { key: 'next', icon: nearest ? (EVENT_ICONS[nearest.event_type] || '📌') : '📅', label: 'いちばん近い予定', value: nearestValue, x: 50, y: 21, size: 78, color: '#96324e', delay: 0, hang: 16 },
                { key: 'list', icon: '🗓️', label: '今日・直近', value: `${listCount}件`, x: 21, y: 30, size: 62, color: '#5c7a94', delay: 0.4, hang: 22 },
                ...(savingsEvents.length ? [{ key: 'savings', icon: '🐷', label: '貯金', value: savingsEvents.length === 1 ? `${Math.min(100, Math.round((savingsEvents[0].saved_amount / savingsEvents[0].savings_goal) * 100))}%` : `${savingsEvents.length}件`, x: 79, y: 28, size: 64, color: '#b9962e', delay: 0.8, hang: 13 }] : []),
                { key: 'goods', icon: '🎁', label: 'グッズ', x: 50, y: 43, size: 56, color: '#a86a52', delay: 1.2, hang: 19 },
                { key: 'month', icon: '💰', label: '今月の推し活費', value: formatYen(monthTotal), x: 11.5, y: 49, size: 60, color: '#5e7a5b', delay: 0.6, hang: 10 },
                { key: 'oshiCount', icon: '⭐', label: '推している人', value: `${oshiList.length}人`, x: 88, y: 47, size: 58, color: '#7d5f8b', delay: 1.0, hang: 17 },
                { key: 'myOshi', icon: '💗', label: 'わたしの推し', x: 33, y: 56, size: 58, color: '#b26578', delay: 0.2, hang: 12 },
                { key: 'records', icon: '📒', label: '家計簿', x: 66, y: 57, size: 56, color: '#8a6a4f', delay: 1.4, hang: 14 },
              ]
              return (
                <>
                  {/* 糸：枝（実がなっていた位置）から垂らす。実より背面に描く */}
                  {fruitDefs.map((f, i) => (
                    <div key={`string-${f.key}`} className="fruit-string"
                      style={{ left: `${f.x}%`, top: `${f.y}%`, height: `${f.hang}%`,
                        transform: hanging ? 'scaleY(1)' : 'scaleY(0)',
                        transitionDelay: `${hanging ? i * 0.06 : 0}s` }} />
                  ))}
                  {fruitDefs.map((f, i) => {
                    const pos = hanging ? { x: f.x, y: f.y + f.hang } : { x: f.x, y: f.y }
                    return (
                      <Fruit key={f.key} icon={f.icon} label={f.label} value={f.value}
                        x={pos.x} y={pos.y} size={f.size} color={f.color} delay={f.delay}
                        hanging={hanging} moveDelay={hanging ? i * 0.06 : 0}
                        onOpen={openFruit(f.key)} />
                    )
                  })}
                </>
              )
            })()}
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
                  <>あと <CountUp className="text-6xl font-black align-middle" value={daysUntil(nearest.event_date)} format={(n) => n} duration={500} /> 日</>
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

      {/* 第18弾：貯金の実タップ→まず目標つきイベントの一覧を表示し、選んだイベントの入出金へ進む */}
      {open?.key === 'savings' && savingsEvents.length > 0 && (
        <FruitZoomModal title="貯金の状況" origin={open.origin} onClose={close}>
          <p className="text-[11px] text-ink-soft mb-2">貯金目標があるイベントの一覧です。タップすると貯金・引き出しができます。</p>
          <div className="space-y-2">
            {savingsEvents.map((ev) => {
              const pct = Math.min(100, Math.round((ev.saved_amount / ev.savings_goal) * 100))
              const past = daysUntil(ev.event_date) < 0
              return (
                <button key={ev.id} onClick={() => nav(`/events?focus=${ev.id}&savings=1`)}
                  className="press w-full text-left bg-paper rounded-2xl border border-paper-line/60 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold truncate">🐷 {ev.name}</p>
                    <span className="font-bold text-xs text-wine shrink-0">達成率 {pct}%</span>
                  </div>
                  <p className="text-[10px] text-ink-soft mb-1">{formatDateJa(ev.event_date)}{past ? '・開催済み' : ''}</p>
                  <ProgressBar value={ev.saved_amount} max={ev.savings_goal} />
                  <p className="text-[10px] text-ink-soft mt-1">
                    {formatYen(ev.saved_amount)} / {formatYen(ev.savings_goal)}
                    {ev.saved_amount >= ev.savings_goal
                      ? '・🎉 目標達成！'
                      : `・あと ${formatYen(Math.max(0, ev.savings_goal - ev.saved_amount))}`}
                  </p>
                </button>
              )
            })}
          </div>
        </FruitZoomModal>
      )}

      {open?.key === 'month' && (
        <FruitZoomModal title="今月の推し活費" origin={open.origin} onClose={close}>
          <p className="text-xs text-ink-soft">今月の推し活費（参戦記録の合計）</p>
          {/* 金額がカラカラっとカウントアップする */}
          <p className="text-3xl font-black text-wine mt-1"><CountUp value={monthTotal} format={formatYen} /></p>
          <PrimaryButton className="w-full mt-4" onClick={() => nav('/records')}>家計簿を見る</PrimaryButton>
        </FruitZoomModal>
      )}

      {open?.key === 'oshiCount' && (
        <FruitZoomModal title="推している人" origin={open.origin} onClose={close}>
          <p className="text-xs text-ink-soft">いま推している人</p>
          <p className="text-3xl font-black text-wine mt-1"><CountUp value={oshiList.length} format={(n) => n} duration={500} /> 人</p>
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
