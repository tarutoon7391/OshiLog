import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { readFileAsDataUrl } from '../util'
import { Card, PrimaryButton, GhostButton, SectionTitle, Empty } from '../components/ui'

// 推し詳細ページ：代表画像・ジャンル・登録人数・公式/グッズURL・承認済みギャラリー
export default function OshiDetail() {
  const { masterId } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)

  const reload = () => api(`/oshi/master/${masterId}`).then(setData).catch((e) => setError(e.message))
  useEffect(() => { reload() }, [masterId])

  const register = async () => {
    setBusy(true)
    try {
      await api('/oshi', { method: 'POST', body: { name: data.name, genre: data.genre } })
      const s = getSocket(); if (s) s.emit('resync')
      reload()
    } catch (err) { alert(err.message) }
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

  if (error) return (
    <div className="text-center py-10">
      <p className="text-ink-soft text-sm">{error}</p>
      <button onClick={() => nav(-1)} className="text-wine text-sm underline mt-3">戻る</button>
    </div>
  )
  if (!data) return <p className="text-center text-ink-soft text-sm py-10">読み込み中…</p>

  const rep = data.image_url || (data.gallery[0] && data.gallery[0].image_url)

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

      <Card>
        <SectionTitle>着せ替えギャラリー</SectionTitle>
        {data.gallery.length === 0 ? (
          <Empty icon="🖼️" message="承認済みの画像はまだありません" />
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {data.gallery.map((g) => (
              <div key={g.id} className="aspect-square rounded-lg overflow-hidden border border-paper-line/60">
                <img src={g.image_url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
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
