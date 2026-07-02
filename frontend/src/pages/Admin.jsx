import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { readFileAsDataUrl, formatDateJa } from '../util'
import { Card, Modal, Field, inputClass, PrimaryButton, GhostButton, Empty, Loading } from '../components/ui'

const emptyEvent = { name: '', artist_id: null, event_date: '', location: '', description: '', image: '', venue_id: null }
const emptyVenue = { name: '', address: '', latitude: '', longitude: '', nearest_station: '', fare_note: '' }
// 推しマスターの新規追加・編集フォーム（currentImage=既存の代表画像, image=新しく選んだ画像）
const emptyOshi = { name: '', genre: 'その他', official_url: '', goods_url: '', currentImage: '', image: '' }

// 管理者専用：イベント管理／会場管理／着せ替え画像の審査／推し情報の編集
export default function Admin() {
  const [tab, setTab] = useState('events') // events | venues | kisekae | oshi
  const [events, setEvents] = useState([])
  const [masters, setMasters] = useState([])
  const [venues, setVenues] = useState([])
  const [images, setImages] = useState([])
  const [oshiMasters, setOshiMasters] = useState([])
  const [eventForm, setEventForm] = useState(null)
  const [venueForm, setVenueForm] = useState(null)
  const [oshiForm, setOshiForm] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  const loadEvents = () => api('/admin/events').then(setEvents).catch((e) => setError(e.message))
  const loadVenues = () => api('/admin/venues').then(setVenues).catch((e) => setError(e.message))
  const loadImages = () => api('/admin/oshi-images?status=pending').then(setImages).catch((e) => setError(e.message))
  const loadOshi = () => api('/admin/oshi-master').then(setOshiMasters).catch((e) => setError(e.message))

  useEffect(() => {
    api('/oshi/browse').then(setMasters).catch(console.error)
    Promise.allSettled([loadEvents(), loadVenues(), loadImages(), loadOshi()]).finally(() => setLoading(false))
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

  // 会場（venue）の登録・編集・削除（管理者のみ。判定はサーバー側でも実施）
  const saveVenue = async (e) => {
    e.preventDefault(); setError('')
    try {
      const body = {
        name: venueForm.name, address: venueForm.address,
        latitude: venueForm.latitude === '' ? null : Number(venueForm.latitude),
        longitude: venueForm.longitude === '' ? null : Number(venueForm.longitude),
        nearest_station: venueForm.nearest_station || null,
        fare_note: venueForm.fare_note || null,
      }
      if (venueForm.id) await api(`/admin/venues/${venueForm.id}`, { method: 'PUT', body })
      else await api('/admin/venues', { method: 'POST', body })
      setVenueForm(null); loadVenues()
    } catch (err) { setError(err.message) }
  }
  const removeVenue = async (v) => {
    if (!confirm(`会場「${v.name}」を削除しますか？紐づくイベントの会場は未設定になります。`)) return
    await api(`/admin/venues/${v.id}`, { method: 'DELETE' }); loadVenues()
  }

  // 着せ替え審査
  const judge = async (img, action) => {
    await api(`/admin/oshi-images/${img.id}/${action}`, { method: 'POST' })
    loadImages()
  }

  // 推しマスターの代表画像を選ぶ（管理者が直接登録。2MBまで）
  const handleOshiFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try { const img = await readFileAsDataUrl(file, 2); setOshiForm((f) => ({ ...f, image: img })) }
    catch (err) { alert(err.message) }
  }

  // 推しの新規追加・編集（名前・ジャンル・公式/グッズURL・代表画像）。判定はサーバー側でも管理者限定。
  const saveOshi = async (e) => {
    e.preventDefault(); setError('')
    try {
      const body = {
        name: oshiForm.name, genre: oshiForm.genre,
        official_url: oshiForm.official_url || null, goods_url: oshiForm.goods_url || null,
        image_url: oshiForm.image || null, // 新しく選んだときだけ差し替え（未選択なら既存を維持）
      }
      if (oshiForm.id) await api(`/admin/oshi-master/${oshiForm.id}`, { method: 'PUT', body })
      else await api('/admin/oshi-master', { method: 'POST', body })
      setOshiForm(null); loadOshi()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="space-y-3">
      <div>
        <button onClick={() => nav(-1)} className="text-wine text-sm">‹ 戻る</button>
        <h2 className="font-bold text-lg text-wine">管理メニュー（管理者）</h2>
      </div>

      <div className="grid grid-cols-4 bg-paper rounded-xl p-1 text-[11px] font-bold gap-1">
        <button className={`rounded-lg py-1.5 ${tab === 'events' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('events')}>🎪 イベント</button>
        <button className={`rounded-lg py-1.5 ${tab === 'venues' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('venues')}>📍 会場</button>
        <button className={`relative rounded-lg py-1.5 ${tab === 'kisekae' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('kisekae')}>
          🖼️ 審査
          {images.length > 0 && <span className="absolute -top-1 -right-1 bg-wine text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center border border-paper-card">{images.length}</span>}
        </button>
        <button className={`rounded-lg py-1.5 ${tab === 'oshi' ? 'bg-wine text-white' : 'text-ink-soft'}`} onClick={() => setTab('oshi')}>⭐ 推し</button>
      </div>

      {error && <p className="text-wine text-xs">{error}</p>}
      {loading && <Loading label="読み込み中…" />}

      {/* イベント管理 */}
      {tab === 'events' && (
        <>
          <div className="flex justify-end">
            <PrimaryButton onClick={() => setEventForm({ ...emptyEvent })}>＋ イベント作成</PrimaryButton>
          </div>
          {!loading && events.length === 0 && <Card><Empty icon="🎪" message="イベントがありません。作成しましょう。" /></Card>}
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
                <GhostButton onClick={() => setEventForm({ ...ev, artist_id: ev.artist_id || null, venue_id: ev.venue_id || null, image: ev.image || '', location: ev.location || '', description: ev.description || '' })}>編集</GhostButton>
                <GhostButton onClick={() => removeEvent(ev)}>削除</GhostButton>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* 会場管理 */}
      {tab === 'venues' && (
        <>
          <div className="flex justify-end">
            <PrimaryButton onClick={() => setVenueForm({ ...emptyVenue })}>＋ 会場を登録</PrimaryButton>
          </div>
          <p className="text-[11px] text-ink-soft">会場を登録すると、イベント作成時に紐づけて地図・アクセスを表示できます（緯度経度が必要）。</p>
          {!loading && venues.length === 0 && <Card><Empty icon="📍" message="登録された会場がありません。作成しましょう。" /></Card>}
          {venues.map((v) => (
            <Card key={v.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{v.name}</p>
                  <p className="text-[11px] text-ink-soft">📮 {v.address}</p>
                  <p className="text-[11px] text-ink-soft">🗺 {Number(v.latitude).toFixed(5)}, {Number(v.longitude).toFixed(5)}</p>
                  {v.nearest_station && <p className="text-[11px] text-ink-soft">🚉 {v.nearest_station}</p>}
                  {v.fare_note && <p className="text-[11px] text-ink-soft">💰 {v.fare_note}</p>}
                </div>
                <span className="text-[11px] text-ink-soft shrink-0">🎪 {v.event_count}件</span>
              </div>
              <div className="flex gap-2 mt-2">
                <GhostButton onClick={() => setVenueForm({
                  id: v.id, name: v.name, address: v.address,
                  latitude: v.latitude, longitude: v.longitude,
                  nearest_station: v.nearest_station || '', fare_note: v.fare_note || '',
                })}>編集</GhostButton>
                <GhostButton onClick={() => removeVenue(v)}>削除</GhostButton>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* 着せ替え審査 */}
      {tab === 'kisekae' && (
        <>
          <p className="text-[11px] text-ink-soft">ユーザーから申請された推し画像を承認・却下します（判定はサーバー側で保存）。</p>
          {!loading && images.length === 0 && <Card><Empty icon="✅" message="審査待ちの画像はありません。" /></Card>}
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

      {/* 推し情報の管理（新規追加・名前・ジャンル・公式/グッズURL・代表画像） */}
      {tab === 'oshi' && (
        <>
          <div className="flex justify-end">
            <PrimaryButton onClick={() => setOshiForm({ ...emptyOshi })}>＋ 推しを追加</PrimaryButton>
          </div>
          <p className="text-[11px] text-ink-soft">推しの新規追加・名前・ジャンル・公式/グッズURL・代表画像は、情報の正確性のため管理者が登録・変更します。</p>
          {!loading && oshiMasters.length === 0 && <Card><Empty icon="⭐" message="登録された推しがありません。追加しましょう。" /></Card>}
          {oshiMasters.map((m) => (
            <Card key={m.id}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-paper flex items-center justify-center shrink-0">
                  {m.image_url ? <img src={m.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xl text-wine/40 font-black">{m.name.slice(0, 1)}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm truncate">{m.name}</p>
                  <p className="text-[11px] text-ink-soft">{m.genre}・👥{m.registered_count}人</p>
                  <p className="text-[10px] text-ink-soft">{m.image_url ? '🖼 画像✓' : '画像✗'} / {m.official_url ? '🌐 公式✓' : '公式✗'} / {m.goods_url ? '🛍 グッズ✓' : 'グッズ✗'}</p>
                </div>
                <GhostButton onClick={() => setOshiForm({ id: m.id, name: m.name, genre: m.genre, official_url: m.official_url || '', goods_url: m.goods_url || '', currentImage: m.image_url || '', image: '' })}>編集</GhostButton>
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
            <Field label="会場（任意・地図/アクセス表示に使用）">
              <select className={inputClass} value={eventForm.venue_id ?? ''}
                onChange={(e) => setEventForm({ ...eventForm, venue_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">紐づけない</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
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

      {/* 会場 作成・編集モーダル */}
      {venueForm && (
        <Modal title={venueForm.id ? '会場を編集' : '会場を登録'} onClose={() => setVenueForm(null)}>
          <form onSubmit={saveVenue}>
            <Field label="会場名 *">
              <input className={inputClass} value={venueForm.name} maxLength={80}
                onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })} placeholder="例：幕張メッセ" />
            </Field>
            <Field label="住所 *">
              <input className={inputClass} value={venueForm.address} maxLength={120}
                onChange={(e) => setVenueForm({ ...venueForm, address: e.target.value })} placeholder="例：千葉県千葉市美浜区中瀬2-1" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="緯度(latitude) *">
                <input type="number" step="any" className={inputClass} value={venueForm.latitude}
                  onChange={(e) => setVenueForm({ ...venueForm, latitude: e.target.value })} placeholder="例：35.6479" />
              </Field>
              <Field label="経度(longitude) *">
                <input type="number" step="any" className={inputClass} value={venueForm.longitude}
                  onChange={(e) => setVenueForm({ ...venueForm, longitude: e.target.value })} placeholder="例：140.0347" />
              </Field>
            </div>
            <p className="text-[10px] text-ink-soft mb-3">※ 緯度経度はGoogleマップで会場を右クリック→先頭の数値をコピーして貼り付けられます。</p>
            <Field label="最寄り駅（任意）">
              <input className={inputClass} value={venueForm.nearest_station} maxLength={60}
                onChange={(e) => setVenueForm({ ...venueForm, nearest_station: e.target.value })} placeholder="例：海浜幕張駅" />
            </Field>
            <Field label="運賃・所要時間メモ（任意）">
              <textarea className={inputClass + ' resize-none'} rows={2} value={venueForm.fare_note} maxLength={200}
                onChange={(e) => setVenueForm({ ...venueForm, fare_note: e.target.value })} placeholder="例：東京駅からJR京葉線で約30分・約570円" />
            </Field>
            <p className="text-[10px] text-ink-soft mb-3">※ 運賃は自動取得しません。目安を出したい場合のみ、このメモに自由記述してください。</p>
            <PrimaryButton className="w-full" disabled={!venueForm.name.trim() || !venueForm.address.trim() || venueForm.latitude === '' || venueForm.longitude === ''}>{venueForm.id ? '更新する' : '登録する'}</PrimaryButton>
          </form>
        </Modal>
      )}

      {/* 推し 新規追加・編集モーダル */}
      {oshiForm && (
        <Modal title={oshiForm.id ? '推しを編集' : '推しを追加'} onClose={() => setOshiForm(null)}>
          <form onSubmit={saveOshi}>
            <Field label="名前 *">
              <input className={inputClass} value={oshiForm.name} maxLength={60}
                onChange={(e) => setOshiForm({ ...oshiForm, name: e.target.value })} placeholder="例：推乃 愛" />
            </Field>
            <Field label="ジャンル">
              <input className={inputClass} value={oshiForm.genre} onChange={(e) => setOshiForm({ ...oshiForm, genre: e.target.value })} placeholder="例：アイドル" />
            </Field>
            <Field label="代表画像（任意・2MBまで）">
              <input type="file" accept="image/*" onChange={handleOshiFile} className="text-xs" />
            </Field>
            {(oshiForm.image || oshiForm.currentImage) && (
              <div className="flex items-center gap-3 mb-3">
                <img src={oshiForm.image || oshiForm.currentImage} alt="プレビュー" className="w-16 h-16 rounded-lg object-cover" />
                <span className="text-[11px] text-ink-soft">{oshiForm.image ? '新しい画像に差し替えます' : '現在の代表画像'}</span>
                {oshiForm.image && <button type="button" className="text-xs text-ink-soft underline" onClick={() => setOshiForm({ ...oshiForm, image: '' })}>取消</button>}
              </div>
            )}
            <Field label="公式サイトURL">
              <input className={inputClass} value={oshiForm.official_url} onChange={(e) => setOshiForm({ ...oshiForm, official_url: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="グッズページURL">
              <input className={inputClass} value={oshiForm.goods_url} onChange={(e) => setOshiForm({ ...oshiForm, goods_url: e.target.value })} placeholder="https://…" />
            </Field>
            <PrimaryButton className="w-full" disabled={!oshiForm.name.trim()}>{oshiForm.id ? '保存する' : '追加する'}</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  )
}
