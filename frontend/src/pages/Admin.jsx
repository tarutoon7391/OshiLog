import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { readFileAsDataUrl, formatDateJa } from '../util'
import { Card, Modal, Field, inputClass, PrimaryButton, GhostButton, Empty, SectionTitle } from '../components/ui'

const emptyEvent = { name: '', artist_id: null, event_date: '', location: '', description: '', image: '' }

// 管理者専用：イベント管理／着せ替え画像の審査／推し情報の編集
export default function Admin() {
  const [tab, setTab] = useState('events') // events | kisekae | oshi
  const [events, setEvents] = useState([])
  const [masters, setMasters] = useState([])
  const [images, setImages] = useState([])
  const [oshiMasters, setOshiMasters] = useState([])
  const [eventForm, setEventForm] = useState(null)
  const [oshiForm, setOshiForm] = useState(null)
  const [error, setError] = useState('')
  const nav = useNavigate()

  const loadEvents = () => api('/admin/events').then(setEvents).catch((e) => setError(e.message))
  const loadImages = () => api('/admin/oshi-images?status=pending').then(setImages).catch((e) => setError(e.message))
  const loadOshi = () => api('/admin/oshi-master').then(setOshiMasters).catch((e) => setError(e.message))

  useEffect(() => {
    loadEvents()
    api('/oshi/browse').then(setMasters).catch(console.error)
    loadImages(); loadOshi()
  }, [])

  const handleEventFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try { const img = await readFileAsDataUrl(file, 2); setEventForm((f) => ({ ...f, image: img })) }
    catch (err) { alert(err.message) }
  }

  const saveEvent = async (e) => {
    e.preventDefault(); setError('')
    try {
      if (eventForm.id) await api(`/events/${eventForm.id}`, { method: 'PUT', body: eventForm })
      else await api('/events', { method: 'POST', body: eventForm })
      setEventForm(null); loadEvents()
    } catch (err) { setError(err.message) }
  }
  const removeEvent = async (ev) => {
    if (!confirm(`「${ev.name}」を削除しますか？参加者・チャットも削除されます。`)) return
    await api(`/events/${ev.id}`, { method: 'DELETE' }); loadEvents()
  }

  // 着せ替え審査
  const judge = async (img, action) => {
    await api(`/admin/oshi-images/${img.id}/${action}`, { method: 'POST' })
    loadImages()
  }

  // 推し情報編集
  const saveOshi = async (e) => {
    e.preventDefault(); setError('')
    try {
      await api(`/admin/oshi-master/${oshiForm.id}`, { method: 'PUT', body: {
        genre: oshiForm.genre, official_url: oshiForm.official_url || null, goods_url: oshiForm.goods_url || null,
      } })
      setOshiForm(null); loadOshi()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="space-y-3">
      <div>
        <button onClick={() => nav(-1)} className="text-wine text-sm">‹ 戻る</button>
        <h2 className="font-bold text-lg text-wine">管理メニュー（管理者）</h2>
      </div>

      <div className="grid grid-cols-3 bg-paper rounded-xl p-1 text-xs font-bold gap-1">
        <button className={`rounded-lg py-1.5 ${tab === 'events' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('events')}>🎪 イベント</button>
        <button className={`relative rounded-lg py-1.5 ${tab === 'kisekae' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('kisekae')}>
          🖼️ 着せ替え審査
          {images.length > 0 && <span className="absolute -top-1 -right-1 bg-wine text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center border border-paper-card">{images.length}</span>}
        </button>
        <button className={`rounded-lg py-1.5 ${tab === 'oshi' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('oshi')}>⭐ 推し情報</button>
      </div>

      {error && <p className="text-wine text-xs">{error}</p>}

      {/* イベント管理 */}
      {tab === 'events' && (
        <>
          <div className="flex justify-end">
            <PrimaryButton onClick={() => setEventForm({ ...emptyEvent })}>＋ イベント作成</PrimaryButton>
          </div>
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
                <GhostButton onClick={() => setEventForm({ ...ev, artist_id: ev.artist_id || null, image: ev.image || '', location: ev.location || '', description: ev.description || '' })}>編集</GhostButton>
                <GhostButton onClick={() => removeEvent(ev)}>削除</GhostButton>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* 着せ替え審査 */}
      {tab === 'kisekae' && (
        <>
          <p className="text-[11px] text-ink-soft">ユーザーから申請された推し画像を承認・却下します（判定はサーバー側で保存）。</p>
          {images.length === 0 && <Card><Empty icon="✅" message="審査待ちの画像はありません。" /></Card>}
          {images.map((img) => (
            <Card key={img.id}>
              <div className="flex gap-3">
                <img src={img.image_url} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm">{img.oshi_name}</p>
                  <p className="text-[11px] text-ink-soft">申請者：{img.submitter_name || '不明'}</p>
                  <div className="flex gap-2 mt-2">
                    <PrimaryButton onClick={() => judge(img, 'approve')}>承認</PrimaryButton>
                    <GhostButton onClick={() => judge(img, 'reject')}>却下</GhostButton>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* 推し情報の編集（公式URL・グッズURL・ジャンル） */}
      {tab === 'oshi' && (
        <>
          <p className="text-[11px] text-ink-soft">公式サイト・グッズページのURLは、情報の正確性のため管理者が登録します。</p>
          {oshiMasters.length === 0 && <Card><Empty icon="⭐" message="登録された推しがありません。" /></Card>}
          {oshiMasters.map((m) => (
            <Card key={m.id}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-paper flex items-center justify-center shrink-0">
                  {m.image_url ? <img src={m.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xl text-wine/40 font-black">{m.name.slice(0, 1)}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm truncate">{m.name}</p>
                  <p className="text-[11px] text-ink-soft">{m.genre}・👥{m.registered_count}人</p>
                  <p className="text-[10px] text-ink-soft">{m.official_url ? '🌐 公式✓' : '公式✗'} / {m.goods_url ? '🛍 グッズ✓' : 'グッズ✗'}</p>
                </div>
                <GhostButton onClick={() => setOshiForm({ id: m.id, genre: m.genre, official_url: m.official_url || '', goods_url: m.goods_url || '' })}>編集</GhostButton>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* イベント 作成・編集モーダル */}
      {eventForm && (
        <Modal title={eventForm.id ? 'イベントを編集' : 'イベントを作成'} onClose={() => setEventForm(null)}>
          <form onSubmit={saveEvent}>
            <Field label="イベント名 *">
              <input className={inputClass} value={eventForm.name} maxLength={60}
                onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} placeholder="例：サマーソニック2026" />
            </Field>
            <Field label="対象アーティスト（任意）">
              <select className={inputClass} value={eventForm.artist_id ?? ''}
                onChange={(e) => setEventForm({ ...eventForm, artist_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">選択しない</option>
                {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="日付 *">
              <input type="date" className={inputClass} value={eventForm.event_date}
                onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} />
            </Field>
            <Field label="場所">
              <input className={inputClass} value={eventForm.location}
                onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} placeholder="例：幕張メッセ" />
            </Field>
            <Field label="説明">
              <textarea className={inputClass + ' resize-none'} rows={2} value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} />
            </Field>
            <Field label="画像（任意・2MBまで）">
              <input type="file" accept="image/*" onChange={handleEventFile} className="text-xs" />
            </Field>
            {eventForm.image && (
              <div className="flex items-center gap-3 mb-3">
                <img src={eventForm.image} alt="プレビュー" className="w-20 h-14 rounded-lg object-cover" />
                <button type="button" className="text-xs text-ink-soft underline" onClick={() => setEventForm({ ...eventForm, image: '' })}>画像を外す</button>
              </div>
            )}
            <PrimaryButton className="w-full" disabled={!eventForm.name.trim() || !eventForm.event_date}>{eventForm.id ? '更新する' : '作成する'}</PrimaryButton>
          </form>
        </Modal>
      )}

      {/* 推し情報 編集モーダル */}
      {oshiForm && (
        <Modal title="推し情報を編集" onClose={() => setOshiForm(null)}>
          <form onSubmit={saveOshi}>
            <Field label="ジャンル">
              <input className={inputClass} value={oshiForm.genre} onChange={(e) => setOshiForm({ ...oshiForm, genre: e.target.value })} />
            </Field>
            <Field label="公式サイトURL">
              <input className={inputClass} value={oshiForm.official_url} onChange={(e) => setOshiForm({ ...oshiForm, official_url: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="グッズページURL">
              <input className={inputClass} value={oshiForm.goods_url} onChange={(e) => setOshiForm({ ...oshiForm, goods_url: e.target.value })} placeholder="https://…" />
            </Field>
            <PrimaryButton className="w-full">保存する</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
