import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { formatDateJa } from '../util'
import { Card, Modal, Field, inputClass, PrimaryButton, GhostButton, Empty } from '../components/ui'

const emptyForm = { name: '', artist_id: null, event_date: '', location: '', description: '', image: '' }

// 管理者専用：イベントの作成・編集・削除＋参加者数の確認
export default function Admin() {
  const [events, setEvents] = useState([])
  const [masters, setMasters] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const nav = useNavigate()

  const reload = () => api('/admin/events').then(setEvents).catch((e) => setError(e.message))
  useEffect(() => {
    reload()
    api('/oshi/browse').then(setMasters).catch(console.error)
  }, [])

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('画像は2MB以下にしてください'); return }
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result }))
    reader.readAsDataURL(file)
  }

  const save = async (e) => {
    e.preventDefault(); setError('')
    try {
      if (form.id) await api(`/events/${form.id}`, { method: 'PUT', body: form })
      else await api('/events', { method: 'POST', body: form })
      setForm(null); reload()
    } catch (err) { setError(err.message) }
  }

  const remove = async (ev) => {
    if (!confirm(`「${ev.name}」を削除しますか？参加者・チャットも削除されます。`)) return
    await api(`/events/${ev.id}`, { method: 'DELETE' }); reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => nav(-1)} className="text-wine text-sm">‹ 戻る</button>
          <h2 className="font-bold text-lg text-wine">イベント管理（管理者）</h2>
        </div>
        <PrimaryButton onClick={() => setForm({ ...emptyForm })}>＋ 作成</PrimaryButton>
      </div>

      {error && <p className="text-wine text-xs">{error}</p>}
      {events.length === 0 && <Card><Empty icon="🎪" message="イベントがありません。作成しましょう。" /></Card>}

      {events.map((ev) => (
        <Card key={ev.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold">{ev.name}</p>
              <p className="text-[11px] text-ink-soft">📅 {formatDateJa(ev.event_date)}</p>
              {ev.location && <p className="text-[11px] text-ink-soft">📍 {ev.location}</p>}
              {ev.artist_name && <p className="text-[11px] text-ink-soft">🎤 {ev.artist_name}</p>}
            </div>
            <span className="text-xs font-bold text-wine shrink-0">👥 {ev.participant_count}人</span>
          </div>
          <div className="flex gap-2 mt-2">
            <GhostButton onClick={() => setForm({ ...ev, artist_id: ev.artist_id || null, image: ev.image || '', location: ev.location || '', description: ev.description || '' })}>編集</GhostButton>
            <GhostButton onClick={() => remove(ev)}>削除</GhostButton>
          </div>
        </Card>
      ))}

      {form && (
        <Modal title={form.id ? 'イベントを編集' : 'イベントを作成'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <Field label="イベント名 *">
              <input className={inputClass} value={form.name} maxLength={60}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：サマーソニック2026" />
            </Field>
            <Field label="対象アーティスト（任意）">
              <select className={inputClass} value={form.artist_id ?? ''}
                onChange={(e) => setForm({ ...form, artist_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">選択しない</option>
                {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="日付 *">
              <input type="date" className={inputClass} value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </Field>
            <Field label="場所">
              <input className={inputClass} value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="例：幕張メッセ" />
            </Field>
            <Field label="説明">
              <textarea className={inputClass + ' resize-none'} rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="画像（任意・2MBまで）">
              <input type="file" accept="image/*" onChange={handleFile} className="text-xs" />
            </Field>
            {form.image && (
              <div className="flex items-center gap-3 mb-3">
                <img src={form.image} alt="プレビュー" className="w-20 h-14 rounded-lg object-cover" />
                <button type="button" className="text-xs text-ink-soft underline" onClick={() => setForm({ ...form, image: '' })}>画像を外す</button>
              </div>
            )}
            {error && <p className="text-wine text-xs mb-2">{error}</p>}
            <PrimaryButton className="w-full" disabled={!form.name.trim() || !form.event_date}>{form.id ? '更新する' : '作成する'}</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
