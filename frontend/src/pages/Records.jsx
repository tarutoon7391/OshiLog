import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { api } from '../api'
import { currentMonth, shiftMonth, todayStr, formatYen } from '../util'
import { Card, Modal, Field, inputClass, OshiSelect, PrimaryButton, Empty, Loading } from '../components/ui'

const emptyForm = { title: '', record_date: '', amount: '', oshi_id: null, memo: '', event_id: null }

// 参戦記録・家計簿＋推し別貢献度の可視化
export default function Records() {
  const [tab, setTab] = useState('list')
  const [month, setMonth] = useState(currentMonth())
  const [list, setList] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [joinedEvents, setJoinedEvents] = useState([])
  const [stats, setStats] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [stamped, setStamped] = useState(false) // 登録直後の判子演出

  const reload = () => {
    api(`/records?month=${month}`).then(setList).catch(console.error).finally(() => setLoading(false))
    api('/stats/summary').then(setStats).catch(console.error)
  }
  useEffect(() => { reload() }, [month])
  useEffect(() => {
    api('/oshi').then(setOshiList).catch(console.error)
    api('/events').then((evs) => setJoinedEvents(evs.filter((e) => e.joined))).catch(console.error)
  }, [])

  const save = async (e) => {
    e.preventDefault(); setError('')
    try {
      await api('/records', { method: 'POST', body: form })
      setForm(null); reload()
      // 記録できた合図として「参戦記録」の判子をトンと押す（ハートが舞い終わるまで表示）
      setStamped(true)
      setTimeout(() => setStamped(false), 1600)
    } catch (err) { setError(err.message) }
  }
  const remove = async (r) => {
    if (!confirm(`「${r.title}」を削除しますか？`)) return
    await api(`/records/${r.id}`, { method: 'DELETE' }); reload()
  }

  const monthTotal = list.reduce((sum, r) => sum + r.amount, 0)
  const grandTotal = (stats?.byOshi || []).reduce((sum, b) => sum + b.total, 0)
  const [y, m] = month.split('-')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-wine">参戦記録・家計簿</h2>
        <PrimaryButton onClick={() => setForm({ ...emptyForm, record_date: todayStr() })}>＋ 記録</PrimaryButton>
      </div>

      <div className="grid grid-cols-2 bg-paper rounded-xl p-1 text-sm font-bold">
        <button className={`press rounded-lg py-1.5 transition-colors ${tab === 'list' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('list')}>📝 記録</button>
        <button className={`press rounded-lg py-1.5 transition-colors ${tab === 'chart' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('chart')}>📊 集計</button>
      </div>

      {tab === 'list' && (
        <>
          <Card className="flex items-center justify-between">
            <button onClick={() => setMonth(shiftMonth(month, -1))} className="text-wine text-xl px-2">‹</button>
            <div className="text-center">
              <p className="font-bold">{y}年{Number(m)}月</p>
              <p className="text-wine font-black text-xl">{formatYen(monthTotal)}</p>
            </div>
            <button onClick={() => setMonth(shiftMonth(month, 1))} className="text-wine text-xl px-2">›</button>
          </Card>

          {loading && <Loading label="記録を読み込み中…" />}
          {!loading && list.length === 0 && <Card><Empty icon="💰" message={'この月の記録はありません。\nライブ参戦やグッズ購入を記録しましょう！'} /></Card>}

          <div className="space-y-3 stagger">
          {list.map((r) => (
            <Card key={r.id} className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.oshi_color || '#c8b7a0' }} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{r.title}</p>
                <p className="text-[11px] text-ink-soft">{r.record_date}{r.oshi_name ? `・${r.oshi_name}` : ''}</p>
                {r.event_name && <p className="text-[11px] text-wine truncate">🎪 {r.event_name}</p>}
                {r.memo && <p className="text-[11px] text-ink-soft truncate">{r.memo}</p>}
              </div>
              <p className="font-bold text-sm shrink-0">{formatYen(r.amount)}</p>
              <button onClick={() => remove(r)} className="text-ink-soft/50 text-lg shrink-0 px-1">×</button>
            </Card>
          ))}
          </div>
        </>
      )}

      {/* 登録直後の判子演出（画面中央にトンと押されて消える。
          第10弾改良版：判子のまわりをハートが舞い上がる） */}
      {stamped && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div className="stamp-once w-36 h-36 rounded-full border-4 border-wine/85 bg-paper-card/70 flex flex-col items-center justify-center"
              style={{ boxShadow: 'inset 0 0 0 3px rgba(150, 50, 78, 0.35)' }}>
              <span className="text-3xl font-black text-wine tracking-widest">参戦</span>
              <span className="text-xl font-bold text-wine tracking-[0.3em] mt-1">記録!</span>
            </div>
            {/* 判子が押されたあと、時間差でハートがふわっと舞う（配色に合わせた3色） */}
            <span className="heart-float absolute -top-2 left-2 text-2xl" style={{ animationDelay: '0.35s' }}>💗</span>
            <span className="heart-float absolute -top-4 right-1 text-lg" style={{ animationDelay: '0.5s' }}>💜</span>
            <span className="heart-float absolute -top-1 left-1/2 text-xl" style={{ animationDelay: '0.65s' }}>💛</span>
          </div>
        </div>
      )}

      {tab === 'chart' && stats && (
        <>
          <Card>
            <p className="text-sm font-bold mb-1">推し別の貢献度（累計 {formatYen(grandTotal)}）</p>
            {stats.byOshi.length === 0 ? <Empty icon="📊" message="記録がたまるとグラフが表示されます" /> : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={stats.byOshi} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                      {stats.byOshi.map((b, i) => <Cell key={i} fill={b.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatYen(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="space-y-1 mt-1">
                  {stats.byOshi.map((b, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="flex-1 truncate">{b.name}</span>
                      <span className="font-bold">{formatYen(b.total)}</span>
                      <span className="text-[11px] text-ink-soft w-10 text-right">{grandTotal ? Math.round((b.total / grandTotal) * 100) : 0}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <p className="text-sm font-bold mb-2">月別の支出推移（直近6か月）</p>
            {stats.monthly.length === 0 ? <Empty icon="📈" message="記録がたまるとグラフが表示されます" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.monthly} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d8cbb0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#8a7a6b' }} tickFormatter={(v) => `${Number(v.slice(5))}月`} />
                  <YAxis tick={{ fontSize: 10, fill: '#8a7a6b' }} tickFormatter={(v) => v >= 10000 ? `${v / 10000}万` : v} />
                  <Tooltip formatter={(v) => formatYen(v)} />
                  <Bar dataKey="total" name="支出" fill="#8b3a4a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </>
      )}

      {form && (
        <Modal title="参戦・購入を記録" onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Field label="内容 *">
              <input className={inputClass} value={form.title} maxLength={50}
                onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：ライブ参戦（チケット代）" />
            </Field>
            <Field label="日付 *">
              <input type="date" className={inputClass} value={form.record_date} onChange={(e) => setForm({ ...form, record_date: e.target.value })} />
            </Field>
            <Field label="金額（円）">
              <input type="number" min="0" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="例：9800" />
            </Field>
            <Field label="推し">
              <OshiSelect oshiList={oshiList} value={form.oshi_id} onChange={(v) => setForm({ ...form, oshi_id: v })} />
            </Field>
            <Field label="イベント（任意・イベント履歴に記録）">
              <select className={inputClass} value={form.event_id ?? ''}
                onChange={(e) => setForm({ ...form, event_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">紐づけない</option>
                {joinedEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </Field>
            <Field label="メモ">
              <input className={inputClass} value={form.memo} maxLength={100} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="例：物販でタオルも購入" />
            </Field>
            {error && <p className="text-wine text-xs mb-2">{error}</p>}
            <PrimaryButton className="w-full" disabled={!form.title.trim() || !form.record_date}>記録する</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
