import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { readFileAsDataUrl } from '../util'
import { Card, PrimaryButton, GhostButton, SectionTitle, Empty, Loading } from '../components/ui'

// 推し詳細ページ：表示画像（着せ替え）・ジャンル・登録人数・公式/グッズURL・承認ギャラリー
export default function OshiDetail() {
  const { masterId } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)

  const reload = () => api(`/oshi/master/${masterId}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { setLoading(true); reload() }, [masterId])

  const register = async () => {
    setBusy(true)
    try {
      await api('/oshi', { method: 'POST', body: { name: data.name, genre: data.genre } })
      const s = getSocket(); if (s) s.emit('resync')
      reload()
    } catch (err) { alert(err.message) }
    finally { setBusy(false) }
  }

  // 着せ替え：この推しの表示画像を選ぶ（自分の画面だけに反映）。null でデフォルトに戻す
  const selectDisplay = async (imageId) => {
    setBusy(true)
    try { await api(`/oshi/master/${masterId}/display-image`, { method: 'PUT', body: { oshi_image_id: imageId } }); reload() }
    catch (err) { alert(err.message) }
    finally { setBusy(false) }
  }

  // 着せ替え画像を管理者に申請
  const submitImage = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setMsg(''); setBusy(true)
    try {
      const image_url = await readFileAsDataUrl(file, 2)
      await api('/oshi/images', { method: 'POST', body: { oshi_master_id: Number(masterId), image_url } })
      setMsg('画像を管理者に申請しました。承認されるとギャラリーに追加されます 🙏')
    } catch (err) { setMsg(err.message) }
    finally { setBusy(false) }
  }

  if (loading) return <Loading label="推しの情報を読み込み中…" />
  if (error) return (
    <div className="text-center py-10">
      <p className="text-ink-soft text-sm">{error}</p>
      <button onClick={() => nav(-1)} className="text-wine text-sm underline mt-3">戻る</button>
    </div>
  )
  if (!data) return null

  const rep = data.display_image
  const isDefault = !data.selected_image_id

  return (
    <div className="space-y-3">
      <button onClick={() => nav(-1)} className="text-wine text-sm">‹ 戻る</button>

      <div className="polaroid rounded-sm mx-auto w-48">
        <div className="aspect-square rounded-sm overflow-hidden flex items-center justify-center" style={{ backgroundColor: rep ? '#fff' : '#e8dfce' }}>
          {rep ? <img src={rep} alt={data.name} className="w-full h-full object-cover" />
            : <span className="text-6xl text-wine/40 font-black">{data.name.slice(0, 1)}</span>}
        </div>
        <p className="text-center font-bold text-ink mt-1">{data.name}</p>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <span className="text-xs bg-wine/10 text-wine font-bold rounded px-2 py-1">{data.genre}</span>
          <span className="text-sm text-ink-soft">👥 {data.registered_count}人が登録中</span>
        </div>
        <div className="mt-3 space-y-2">
          {data.official_url ? (
            <a href={data.official_url} target="_blank" rel="noreferrer" className="block text-sm text-wine underline break-all">🌐 公式サイト</a>
          ) : <p className="text-[11px] text-ink-soft">公式サイトURLは未登録です</p>}
          {data.goods_url ? (
            <a href={data.goods_url} target="_blank" rel="noreferrer" className="block text-sm text-wine underline break-all">🛍 グッズページ</a>
          ) : <p className="text-[11px] text-ink-soft">グッズページURLは未登録です</p>}
          <p className="text-[10px] text-ink-soft">※ URLは情報の正確性のため管理者が登録・編集します</p>
        </div>
        <div className="mt-3">
          {data.mine
            ? <p className="text-sm text-wine font-bold text-center">✔ あなたの推しに登録済み</p>
            : <PrimaryButton className="w-full" disabled={busy} onClick={register}>推しに登録する</PrimaryButton>}
        </div>
      </Card>

      {/* 着せ替え：表示画像の選択（あなたの画面だけに反映） */}
      <Card>
        <SectionTitle>着せ替え（あなたの画面の表示画像）</SectionTitle>
        <p className="text-[11px] text-ink-soft mb-2">
          承認済みの画像から、この推しの表示画像を選べます。<span className="text-wine font-bold">あなたの画面だけ</span>に反映され、他の人の見え方は変わりません。
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {/* デフォルト（未選択）を選ぶタイル */}
          <button onClick={() => selectDisplay(null)} disabled={busy}
            className={`aspect-square rounded-lg overflow-hidden border-2 flex items-center justify-center bg-paper ${isDefault ? 'border-wine ring-2 ring-wine/30' : 'border-paper-line/60'}`}>
            {data.image_url
              ? <img src={data.image_url} alt="デフォルト" className="w-full h-full object-cover" />
              : <span className="text-[10px] text-ink-soft">デフォルト</span>}
          </button>
          {data.gallery.map((g) => {
            const selected = data.selected_image_id === g.id
            return (
              <button key={g.id} onClick={() => selectDisplay(g.id)} disabled={busy}
                className={`aspect-square rounded-lg overflow-hidden border-2 relative ${selected ? 'border-wine ring-2 ring-wine/30' : 'border-paper-line/60'}`}>
                <img src={g.image_url} alt="" className="w-full h-full object-cover" />
                {selected && <span className="absolute bottom-0.5 right-0.5 bg-wine text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">✓</span>}
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-ink-soft mt-2">左上の「デフォルト」を選ぶと、みんな共通の画像に戻ります。</p>

        {data.gallery.length === 0 && (
          <Empty icon="🖼️" message="承認済みの着せ替え画像はまだありません" />
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={submitImage} />
        <GhostButton className="w-full mt-3" disabled={busy} onClick={() => fileRef.current?.click()}>
          📷 この推しの画像を投稿（管理者へ申請）
        </GhostButton>
        {msg && <p className="text-[11px] text-ink-soft mt-2">{msg}</p>}
      </Card>
    </div>
  )
}
