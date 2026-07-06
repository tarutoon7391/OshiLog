import { useEffect, useState } from 'react'
import { api } from '../api'
import { getSocket } from '../socket'
import { formatTime, POST_VISIBILITIES, VISIBILITY_MAP } from '../util'
import { Card, OshiSelect, PrimaryButton, Empty, inputClass, Loading, UserChip } from '../components/ui'

// つぶやき：公開範囲は「全体」「同じ推し」の2種類。削除は投稿者本人のみ。
export default function Posts({ user }) {
  const [list, setList] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState('public_all')
  const [oshiId, setOshiId] = useState(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = () => api('/posts').then(setList).catch(console.error).finally(() => setLoading(false))
  useEffect(() => {
    reload()
    api('/oshi').then(setOshiList).catch(console.error)

    // 新着つぶやきをリアルタイム受信（重複はidで排除）
    const s = getSocket()
    if (s) {
      const onNew = (p) => setList((prev) => prev.some((x) => x.id === p.id) ? prev : [p, ...prev])
      s.on('post:new', onNew)
      return () => s.off('post:new', onNew)
    }
  }, [])

  const submit = async (e) => {
    e.preventDefault(); setError(''); setSending(true)
    try {
      const body = { content, visibility, oshi_id: oshiId }
      const post = await api('/posts', { method: 'POST', body })
      setList((prev) => prev.some((x) => x.id === post.id) ? prev : [post, ...prev])
      setContent('')
    } catch (err) { setError(err.message) }
    finally { setSending(false) }
  }

  const remove = async (p) => {
    if (!confirm('このつぶやきを削除しますか？')) return
    try {
      await api(`/posts/${p.id}`, { method: 'DELETE' })
      setList((prev) => prev.filter((x) => x.id !== p.id))
    } catch (err) { alert(err.message) }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-lg text-wine">つぶやき</h2>

      {/* 投稿フォーム */}
      <Card>
        <form onSubmit={submit}>
          <textarea className={inputClass + ' resize-none'} rows={3} maxLength={300}
            placeholder="推しへの想いをつぶやこう…" value={content} onChange={(e) => setContent(e.target.value)} />

          {/* 公開範囲（2種類） */}
          <div className="mt-2">
            <p className="text-[11px] text-ink-soft mb-1">公開範囲</p>
            <div className="grid grid-cols-2 gap-1.5">
              {POST_VISIBILITIES.map((v) => (
                <button type="button" key={v.key} onClick={() => setVisibility(v.key)}
                  className={`text-xs rounded-lg px-2 py-1.5 border text-left ${visibility === v.key ? 'bg-wine text-white border-wine' : 'border-paper-line text-ink-soft bg-paper-card'}`}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* 推し選択（同じ推し公開のとき必須） */}
          {(visibility === 'public_same_oshi' || oshiId) && (
            <div className="mt-2">
              <OshiSelect oshiList={oshiList} value={oshiId} onChange={setOshiId} />
              {visibility === 'public_same_oshi' && !oshiId && <p className="text-[10px] text-wine mt-1">「同じ推し」で公開するには推しを選んでください</p>}
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-ink-soft">{content.length}/300</span>
            <PrimaryButton disabled={sending || !content.trim() || (visibility === 'public_same_oshi' && !oshiId)}>投稿</PrimaryButton>
          </div>
          {error && <p className="text-wine text-xs mt-1">{error}</p>}
        </form>
      </Card>

      {/* タイムライン */}
      {loading && <Loading label="つぶやきを読み込み中…" />}
      {!loading && list.length === 0 && <Card><Empty icon="✍️" message={'まだつぶやきがありません。\n推しへの想いを残しましょう！'} /></Card>}

      <div className="space-y-3 stagger">
      {list.map((p) => {
        const v = VISIBILITY_MAP[p.visibility]
        const mine = p.user_id === user.id
        return (
          <Card key={p.id}>
            <div className="flex items-center gap-2">
              <UserChip userId={p.user_id} name={p.author_name} avatar={p.author_avatar} size="w-8 h-8">
                <div className="min-w-0 text-left">
                  <p className="text-sm font-bold truncate">{p.author_name}</p>
                  <p className="text-[10px] text-ink-soft">{formatTime(p.created_at)}</p>
                </div>
              </UserChip>
              <div className="ml-auto flex items-center gap-1">
                <span className="text-[10px] bg-paper text-ink-soft rounded-full px-2 py-0.5">{v?.icon} {v?.label}</span>
                {mine && <button onClick={() => remove(p)} className="text-ink-soft/50 text-base px-1">×</button>}
              </div>
            </div>
            <p className="text-sm mt-2 whitespace-pre-wrap break-words">{p.content}</p>
            {p.oshi_name && (
              <div className="flex gap-1 mt-1.5">
                <span className="text-[10px] text-white rounded-full px-2 py-0.5" style={{ backgroundColor: p.oshi_color || '#c8b7a0' }}>{p.oshi_name}</span>
              </div>
            )}
          </Card>
        )
      })}
      </div>
    </div>
  )
}
