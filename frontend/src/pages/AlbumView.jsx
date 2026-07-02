import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { readFileAsDataUrl } from '../util'
import { Empty, Loading } from '../components/ui'

// チャットルーム単位の共有アルバム（メンバー全員が閲覧・追加できる。グリッド表示）
export default function AlbumView({ user }) {
  const { roomId } = useParams()
  const nav = useNavigate()
  const rid = Number(roomId)
  const [photos, setPhotos] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewer, setViewer] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    api(`/chat/rooms/${rid}/album`).then(setPhotos).catch((e) => setError(e.message)).finally(() => setLoading(false))
    const s = getSocket()
    if (s) {
      const onNew = (d) => { if (d.roomId === rid) setPhotos((prev) => prev.some((p) => p.id === d.photo.id) ? prev : [d.photo, ...prev]) }
      s.on('album:new', onNew)
      return () => s.off('album:new', onNew)
    }
  }, [rid])

  const pick = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(''); setBusy(true)
    try {
      const image_url = await readFileAsDataUrl(file, 3)
      const photo = await api(`/chat/rooms/${rid}/album`, { method: 'POST', body: { image_url } })
      setPhotos((prev) => prev.some((p) => p.id === photo.id) ? prev : [photo, ...prev])
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const remove = async (p) => {
    if (!confirm('この写真を削除しますか？')) return
    await api(`/chat/rooms/${rid}/album/${p.id}`, { method: 'DELETE' })
    setPhotos((prev) => prev.filter((x) => x.id !== p.id))
    setViewer(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => nav(-1)} className="text-wine text-lg">‹</button>
          <h2 className="font-bold text-lg text-wine">共有アルバム</h2>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="bg-wine text-white font-bold rounded-xl px-4 py-2 text-sm shadow disabled:opacity-40">
          {busy ? '追加中…' : '＋ 写真を追加'}
        </button>
      </div>
      <p className="text-[11px] text-ink-soft">このトークのメンバーみんなで見られるアルバムです。</p>
      {error && <p className="text-wine text-xs">{error}</p>}

      {loading ? (
        <Loading label="アルバムを読み込み中…" />
      ) : photos.length === 0 ? (
        <Empty icon="📸" message={'まだ写真がありません。\nライブや遠征の思い出を残しましょう！'} />
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p) => (
            <button key={p.id} onClick={() => setViewer(p)} className="aspect-square rounded-lg overflow-hidden bg-paper-card border border-paper-line/60">
              <img src={p.image_url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* 写真ビューア */}
      {viewer && (
        <div className="fixed inset-0 z-40 bg-ink/80 flex flex-col items-center justify-center p-4" onClick={() => setViewer(null)}>
          <img src={viewer.image_url} alt="" className="max-w-full max-h-[75vh] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <p className="text-white/80 text-xs mt-3">{viewer.uploader_name || '不明'} さんが追加</p>
          {viewer.uploaded_by === user.id && (
            <button onClick={(e) => { e.stopPropagation(); remove(viewer) }} className="text-white/90 text-sm underline mt-2">削除する</button>
          )}
        </div>
      )}
    </div>
  )
}
