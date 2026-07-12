import { useRef, useState } from 'react'

// 画面上部で下にフリック（引っ張る）とページを更新する、よくあるアレ。
// スクロール領域そのものになり、いちばん上にいるときだけ引っ張りを検知する。
// しきい値を超えて指を離すと、少し見せてから location.reload() で更新する。
const THRESHOLD = 70   // これ以上引っ張って離すと更新
const MAX = 90         // 引っ張れる最大量（抵抗をつける）

export default function PullToRefresh({ children, className = '' }) {
  const ref = useRef(null)
  const startY = useRef(null)
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const onTouchStart = (e) => {
    // いちばん上にいるときだけ引っ張り開始（それ以外は通常スクロール）
    startY.current = ref.current && ref.current.scrollTop <= 0 ? e.touches[0].clientY : null
  }
  const onTouchMove = (e) => {
    if (startY.current == null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0 && ref.current.scrollTop <= 0) {
      setDragging(true)
      setPull(Math.min(dy * 0.5, MAX)) // 半分の移動量＝ゴムのような抵抗感
    } else {
      setDragging(false)
      setPull(0)
    }
  }
  const onTouchEnd = () => {
    if (startY.current == null) { setDragging(false); setPull(0); return }
    startY.current = null
    setDragging(false)
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      // インジケーターを少し見せてからページを更新
      setTimeout(() => window.location.reload(), 500)
    } else {
      setPull(0)
    }
  }

  const offset = refreshing ? 56 : pull
  const progress = refreshing ? 1 : Math.min(pull / THRESHOLD, 1) // 0〜1（引っ張るほど満タンに近づく）

  // リング（円周を dashoffset で少しずつ見せる＝時計回りに溜まる）
  const R = 10
  const C = 2 * Math.PI * R
  const dashoffset = C * (1 - progress)

  return (
    <div
      ref={ref}
      className={className}
      style={{ overscrollBehaviorY: 'contain', position: 'relative' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* 引っ張ると現れるインジケーター（コンテンツの上の隙間に表示） */}
      <div className="absolute left-0 right-0 top-0 flex items-end justify-center pointer-events-none overflow-hidden"
        style={{ height: offset, opacity: offset > 4 || refreshing ? 1 : 0 }}>
        <div className="mb-2">
          <svg width="26" height="26" viewBox="0 0 24 24" className={refreshing ? 'animate-spin' : ''}
            style={{ transform: `scale(${refreshing ? 1 : 0.7 + progress * 0.3})`, transition: dragging ? 'none' : 'transform 0.2s ease' }}>
            {/* 下地の薄い円 */}
            <circle cx="12" cy="12" r={R} fill="none" stroke="var(--color-tag, #d8c7b0)" strokeWidth="2.5" opacity="0.35" />
            {/* 進捗リング（12時から時計回りに溜まる）。
                満タン＝離せば更新のサインとして、差し色パープルに変わる */}
            <circle cx="12" cy="12" r={R} fill="none"
              stroke={progress >= 1 ? 'var(--color-pop, #9146ff)' : 'var(--color-wine, #8b3a4a)'} strokeWidth="2.5"
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={dashoffset}
              transform="rotate(-90 12 12)"
              style={{ transition: dragging ? 'stroke 0.15s ease' : 'stroke-dashoffset 0.2s ease, stroke 0.15s ease' }} />
          </svg>
        </div>
      </div>

      {/* 本文（引っ張り量ぶん下へずらす） */}
      <div style={{ transform: `translateY(${offset}px)`, transition: dragging ? 'none' : 'transform 0.25s ease' }}>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
