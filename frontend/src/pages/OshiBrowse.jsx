import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { OSHI_GENRES, OSHI_COLORS } from '../util'
import { Card, Modal, Field, inputClass, PrimaryButton, GhostButton, Empty, Loading } from '../components/ui'

const emptyForm = { name: '', genre: 'アイドル', color: '#8b3a4a', image: '' }

// 推しブラウズ：ジャンルブロック→タップで正方形のポラロイドタイルが展開
export default function OshiBrowse() {
  const [masters, setMasters] = useState([])
  const [myOshi, setMyOshi] = useState([])
  const [openGenre, setOpenGenre] = useState('アイドル')
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  const reload = () => {
    api('/oshi/browse').then(setMasters).catch(console.error).finally(() => setLoading(false))
    api('/oshi').then(setMyOshi).catch(console.error)
  }
  useEffect(() => { reload() }, [])

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('画像は2MB以下にしてください'); return }
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result }))
    reader.readAsDataURL(file)
  }

  // 推しを登録（新規フォーム or タイルからのワンタップ）
  const register = async (body) => {
    setError('')
    try {
      await api('/oshi', { method: 'POST', body })
      const s = getSocket(); if (s) s.emit('resync') // 同じ推しルームへ参加し直す
      setForm(null)
      reload()
    } catch (err) {
      setError(err.message)
      if (!form) alert(err.message)
    }
  }

  // ジャンルごとにマスターをまとめる
  const byGenre = {}
  OSHI_GENRES.forEach((g) => { byGenre[g] = [] })
  masters.forEach((m) => { (byGenre[m.genre] || (byGenre[m.genre] = [])).push(m) })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-wine">推しをさがす・登録</h2>
        <PrimaryButton onClick={() => setForm({ ...emptyForm })}>＋ 登録</PrimaryButton>
      </div>

      {/* 第9弾：推しタブをハブ化（ボトムナビから外したイベントへの導線をここに置く） */}
      <div className="grid grid-cols-2 gap-2">
        <GhostButton onClick={() => nav('/events')}>🎪 イベント一覧</GhostButton>
        <GhostButton onClick={() => nav('/history')}>🕘 イベント履歴</GhostButton>
      </div>

      {loading && <Loading label="推しを読み込み中…" />}
      {!loading && masters.length === 0 && (
        <Card><Empty icon="⭐" message={'まだ誰も推しを登録していません。\n最初の登録者になりましょう！'} /></Card>
      )}

      {OSHI_GENRES.map((genre) => {
        const list = byGenre[genre] || []
        if (list.length === 0) return null
        const open = openGenre === genre
        return (
          <div key={genre}>
            {/* 横長ジャンルブロック */}
            <button
              onClick={() => setOpenGenre(open ? null : genre)}
              className="w-full flex items-center justify-between bg-wine text-white rounded-2xl px-4 py-3 shadow-sm"
            >
              <span className="font-bold">{genre}</span>
              <span className="text-xs opacity-80">{list.length}組 {open ? '▲' : '▼'}</span>
            </button>

            {/* タップで展開するポラロイドタイル一覧 */}
            {open && (
              <div className="grid grid-cols-2 gap-3 mt-3 stagger">
                {list.map((m, i) => (
                  <div key={m.id} className="polaroid rounded-sm" style={{ transform: `rotate(${i % 2 ? 1.3 : -1.3}deg)` }}>
                    <button onClick={() => nav(`/oshi/${m.id}`)} className="press aspect-square w-full rounded-sm overflow-hidden flex items-center justify-center"
                      style={{ backgroundColor: m.display_image ? '#fff' : '#e8dfce' }}>
                      {m.display_image
                        ? <img src={m.display_image} alt={m.name} className="w-full h-full object-cover" />
                        : <span className="text-4xl text-wine/40 font-black">{m.name.slice(0, 1)}</span>}
                    </button>
                    <div className="px-1 pt-1.5">
                      <button onClick={() => nav(`/oshi/${m.id}`)} className="block w-full text-sm font-bold text-ink truncate text-center">{m.name}</button>
                      <p className="text-[11px] text-ink-soft text-center">{m.registered_count}人が登録中</p>
                      <div className="mt-1.5 text-center">
                        {m.mine
                          ? <span className="text-[11px] text-wine font-bold">✔ 登録済み</span>
                          : <GhostButton className="w-full py-1 text-xs" onClick={() => register({ name: m.name, genre: m.genre })}>推しに登録</GhostButton>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* 新規登録モーダル */}
      {form && (
        <Modal title="推しを登録" onClose={() => setForm(null)}>
          <p className="text-[11px] text-ink-soft mb-3">
            同じ名前の推しがすでにあればその推しに紐付きます。いなければあなたが最初の登録者になります。
          </p>
          <Field label="名前 *">
            <input className={inputClass} value={form.name} maxLength={30}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：星野アイ" />
          </Field>
          <Field label="ジャンル">
            <select className={inputClass} value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })}>
              {OSHI_GENRES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="推しカラー">
            <div className="flex gap-2 flex-wrap">
              {OSHI_COLORS.map((c) => (
                <button type="button" key={c}
                  className={`w-8 h-8 rounded-full ${form.color === c ? 'ring-2 ring-offset-2 ring-ink' : ''}`}
                  style={{ backgroundColor: c }} onClick={() => setForm({ ...form, color: c })} />
              ))}
            </div>
          </Field>
          <Field label="画像（任意・最初の登録者がアップロード）">
            <input type="file" accept="image/*" onChange={handleFile} className="text-xs" />
          </Field>
          {form.image && (
            <div className="flex items-center gap-3 mb-3">
              <img src={form.image} alt="プレビュー" className="w-16 h-16 rounded-lg object-cover" />
              <button type="button" className="text-xs text-ink-soft underline" onClick={() => setForm({ ...form, image: '' })}>画像を外す</button>
            </div>
          )}
          {error && <p className="text-wine text-xs mb-2">{error}</p>}
          <PrimaryButton className="w-full" disabled={!form.name.trim()}
            onClick={() => register({ name: form.name.trim(), genre: form.genre, color: form.color, image: form.image || null })}>
            登録する
          </PrimaryButton>
        </Modal>
      )}
    </div>
  )
}
