import { useEffect, useState } from 'react'
import { api } from '../api'
import { EVENT_TYPES, EVENT_ICONS, daysUntil, formatDateJa, todayStr } from '../util'
import { Card, Modal, Field, inputClass, OshiSelect, PrimaryButton, Empty } from '../components/ui'

const emptyForm = { title: '', event_type: 'ライブ', event_date: '', oshi_id: null, memo: '' }

// スケジュール管理＋カウントダウン
export default function Schedule() {
  const [list, setList] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')

  const reload = () => api('/schedules').then(setList).catch(console.error)
  useEffect(() => {
    reload()
    api('/oshi').then(setOshiList).catch(console.error)
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api('/schedules', { method: 'POST', body: form })
      setForm(null)
      reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (s) => {
    if (!confirm(`「${s.title}」を削除しますか？`)) return
    await api(`/schedules/${s.id}`, { method: 'DELETE' })
    reload()
  }

  const upcoming = list.filter((s) => daysUntil(s.event_date) >= 0)
  const past = list.filter((s) => daysUntil(s.event_date) < 0).reverse()

  const Item = ({ s, isPast }) => (
    <Card className={`flex items-center gap-3 ${isPast ? 'opacity-60' : ''}`}>
      <span className="text-2xl">{EVENT_ICONS[s.event_type] || '📌'}</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{s.title}</p>
        <p className="text-[11px] text-gray-400">
          {formatDateJa(s.event_date)}
          {s.oshi_name && (
            <span className="ml-1" style={{ color: s.oshi_color }}>●</span>
          )}
          {s.oshi_name && <span className="ml-0.5">{s.oshi_name}</span>}
        </p>
        {s.memo && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{s.memo}</p>}
      </div>
      {!isPast && (
        <span className="bg-pink-100 text-pink-600 font-bold text-xs rounded-full px-2.5 py-1 shrink-0">
          {daysUntil(s.event_date) === 0 ? '本日！' : `あと${daysUntil(s.event_date)}日`}
        </span>
      )}
      <button onClick={() => remove(s)} className="text-gray-300 text-lg shrink-0 px-1">×</button>
    </Card>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">スケジュール</h2>
        <PrimaryButton onClick={() => setForm({ ...emptyForm, event_date: todayStr() })}>＋ 予定を追加</PrimaryButton>
      </div>

      {list.length === 0 && (
        <Card>
          <Empty icon="📅" message={'予定がまだありません。\nライブや配信、グッズ発売日を登録しましょう！'} />
        </Card>
      )}

      {upcoming.length > 0 && <p className="text-xs font-bold text-gray-500">今後の予定</p>}
      {upcoming.map((s) => <Item key={s.id} s={s} />)}

      {past.length > 0 && <p className="text-xs font-bold text-gray-400 mt-4">過去の予定</p>}
      {past.map((s) => <Item key={s.id} s={s} isPast />)}

      {form && (
        <Modal title="予定を追加" onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Field label="タイトル *">
              <input className={inputClass} value={form.title} maxLength={50}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例：全国ツアー東京公演" />
            </Field>
            <Field label="種類">
              <div className="flex gap-1.5 flex-wrap">
                {EVENT_TYPES.map((t) => (
                  <button type="button" key={t}
                    className={`text-xs rounded-full px-3 py-1.5 border ${form.event_type === t ? 'bg-pink-500 text-white border-pink-500' : 'border-pink-200 text-gray-600'}`}
                    onClick={() => setForm({ ...form, event_type: t })}>
                    {EVENT_ICONS[t]} {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="日付 *">
              <input type="date" className={inputClass} value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </Field>
            <Field label="推し">
              <OshiSelect oshiList={oshiList} value={form.oshi_id}
                onChange={(v) => setForm({ ...form, oshi_id: v })} />
            </Field>
            <Field label="メモ">
              <input className={inputClass} value={form.memo} maxLength={100}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                placeholder="例：物販は14時から" />
            </Field>
            {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
            <PrimaryButton className="w-full" disabled={!form.title.trim() || !form.event_date}>登録する</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
