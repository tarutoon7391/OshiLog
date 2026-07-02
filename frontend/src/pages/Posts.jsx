import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, OshiSelect, PrimaryButton, Empty, inputClass } from '../components/ui'

// 簡易つぶやき投稿（アプリ内完結・SNS連携なし）
export default function Posts() {
  const [list, setList] = useState([])
  const [oshiList, setOshiList] = useState([])
  const [content, setContent] = useState('')
  const [oshiId, setOshiId] = useState(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const reload = () => api('/posts').then(setList).catch(console.error)
  useEffect(() => {
    reload()
    api('/oshi').then(setOshiList).catch(console.error)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      await api('/posts', { method: 'POST', body: { content, oshi_id: oshiId } })
      setContent('')
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const remove = async (p) => {
    if (!confirm('このつぶやきを削除しますか？')) return
    await api(`/posts/${p.id}`, { method: 'DELETE' })
    reload()
  }

  // '2026/7/2 18:30' のような表示にする
  const formatTime = (iso) =>
    new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-lg">つぶやき</h2>

      {/* 投稿フォーム */}
      <Card>
        <form onSubmit={submit}>
          <textarea
            className={inputClass + ' resize-none'}
            rows={3}
            maxLength={300}
            placeholder="推しへの想いをつぶやこう…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1">
              <OshiSelect oshiList={oshiList} value={oshiId} onChange={setOshiId} />
            </div>
            <PrimaryButton disabled={sending || !content.trim()}>投稿</PrimaryButton>
          </div>
          <p className="text-right text-[11px] text-gray-400 mt-1">{content.length}/300</p>
          {error && <p className="text-red-500 text-xs">{error}</p>}
        </form>
      </Card>

      {/* タイムライン */}
      {list.length === 0 && (
        <Card>
          <Empty icon="💬" message={'まだつぶやきがありません。\n推しへの想いを残しましょう！'} />
        </Card>
      )}

      {list.map((p) => (
        <Card key={p.id}>
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            {p.oshi_name && (
              <span className="text-white rounded-full px-2 py-0.5" style={{ backgroundColor: p.oshi_color || '#9ca3af' }}>
                {p.oshi_name}
              </span>
            )}
            <span>{formatTime(p.created_at)}</span>
            <button onClick={() => remove(p)} className="ml-auto text-gray-300 text-base px-1">×</button>
          </div>
          <p className="text-sm mt-2 whitespace-pre-wrap break-words">{p.content}</p>
        </Card>
      ))}
    </div>
  )
}
