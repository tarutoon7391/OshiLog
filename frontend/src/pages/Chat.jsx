import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { formatTime, readFileAsDataUrl, attachmentTypeOf } from '../util'
import { Avatar, Modal, PrimaryButton, GhostButton, Loading } from '../components/ui'

// チャット画面（DM・イベント共通。Socket.ioでリアルタイム＋既読＋添付＋共有アルバム）
export default function Chat({ user }) {
  const { roomId } = useParams()
  const nav = useNavigate()
  const [room, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(null) // 送信確認待ちの添付 { url, type, name }
  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  const taRef = useRef(null)
  const rid = Number(roomId)

  // 開いている間は既読を送る
  const markRead = () => { const s = getSocket(); if (s) s.emit('chat:read', { roomId: rid }) }

  useEffect(() => {
    api('/chat/rooms').then((rooms) => {
      const found = rooms.find((r) => r.id === rid)
      if (!found) { setError('このトークにアクセスできません'); return }
      setRoom(found)
    }).catch(() => setError('読み込みに失敗しました'))

    api(`/chat/rooms/${rid}/messages`)
      .then((ms) => { setMessages(ms); markRead() })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))

    const s = getSocket()
    if (s) {
      s.emit('resync')
      const onMsg = (m) => {
        if (m.room_id !== rid) return
        setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m])
        if (m.sender_id !== user.id) markRead() // 受信したらすぐ既読
      }
      // 既読になったメッセージの既読数を反映（送信者側の「既読」表示更新）
      const onRead = (d) => {
        if (d.roomId !== rid || d.readerId === user.id) return
        setMessages((prev) => prev.map((m) => d.messageIds.includes(m.id) ? { ...m, read_count: (m.read_count || 0) + 1 } : m))
      }
      s.on('chat:message', onMsg)
      s.on('chat:read', onRead)
      return () => { s.off('chat:message', onMsg); s.off('chat:read', onRead) }
    }
  }, [rid])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const doSend = (payload) => {
    const s = getSocket()
    if (!s) { setError('接続がありません'); return }
    s.emit('chat:send', { roomId: rid, ...payload }, (res) => {
      if (res && res.error) setError(res.error)
    })
  }

  const send = (e) => {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    doSend({ content })
    setText('')
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  // ファイルを選んだら、まずプレビューを出して送信確認する（LINE風）
  const pickFile = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 同じファイルを連続で選べるように
    if (!file) return
    setError('')
    try {
      const url = await readFileAsDataUrl(file, 5) // 添付は5MBまで
      setPending({ url, type: attachmentTypeOf(file), name: file.name })
    } catch (err) { setError(err.message) }
  }

  // 確認画面で「送信」を押したら実際に送る
  const confirmSend = () => {
    if (!pending) return
    setSending(true)
    doSend({ attachment: pending })
    setPending(null)
    setTimeout(() => setSending(false), 400)
  }

  // チャットの画像・動画を共有アルバムに保存
  const saveToAlbum = async (m) => {
    try {
      await api(`/chat/rooms/${rid}/album`, { method: 'POST', body: { image_url: m.attachment_url } })
      alert('アルバムに保存しました 📸')
    } catch (err) { alert(err.message) }
  }

  if (error && !room) {
    return (
      <div className="text-center py-10">
        <p className="text-ink-soft text-sm">{error}</p>
        <button onClick={() => nav(-1)} className="text-wine text-sm underline mt-3">戻る</button>
      </div>
    )
  }

  const isDm = room?.type !== 'event'

  return (
    <div className="h-full flex flex-col -m-4">
      {/* ルームヘッダー */}
      <div className="shrink-0 bg-paper-card border-b border-paper-line px-3 py-2 flex items-center gap-2">
        <button onClick={() => nav(-1)} className="text-wine text-lg px-1">‹</button>
        <span className="text-lg">{room?.type === 'event' ? '🎪' : '💬'}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm truncate">{room?.title || 'トーク'}</p>
          {room?.type === 'event' && <p className="text-[10px] text-ink-soft">参加者 {room.member_count}人のグループトーク</p>}
        </div>
        <button onClick={() => nav(`/album/${rid}`)} className="text-xs text-wine border border-wine/40 rounded-full px-2.5 py-1 shrink-0">📸 アルバム</button>
      </div>

      {/* メッセージ（この領域だけスクロール） */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-area px-3 py-3 space-y-2">
        {loading && <Loading label="メッセージを読み込み中…" />}
        {!loading && messages.length === 0 && <p className="text-center text-ink-soft text-xs py-6">まだメッセージがありません。<br />最初のひとことを送ってみましょう！</p>}
        {messages.map((m) => {
          const mine = m.sender_id === user.id
          const readLabel = mine && m.read_count > 0 ? (isDm ? '既読' : `既読 ${m.read_count}`) : null
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && <Avatar image={m.sender_avatar} name={m.sender_name} size="w-7 h-7" textSize="text-xs" />}
              <div className={`max-w-[72%] min-w-0 ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                {!mine && <span className="text-[10px] text-ink-soft ml-1">{m.sender_name}</span>}

                {/* 添付 */}
                {m.attachment_url && m.attachment_type === 'image' && (
                  <img src={m.attachment_url} alt="画像" className="max-w-full rounded-2xl border border-paper-line" />
                )}
                {m.attachment_url && m.attachment_type === 'video' && (
                  <video src={m.attachment_url} controls className="max-w-full rounded-2xl border border-paper-line" />
                )}
                {m.attachment_url && m.attachment_type === 'file' && (
                  <a href={m.attachment_url} download={m.attachment_name || 'file'}
                    className={`rounded-2xl px-3 py-2 text-sm flex items-center gap-2 ${mine ? 'bg-wine text-white' : 'bg-paper-card border border-paper-line'}`}>
                    📎 <span className="truncate max-w-40">{m.attachment_name || 'ファイル'}</span>
                  </a>
                )}

                {/* テキスト */}
                {m.content && (
                  <div className={`max-w-full rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap ${mine ? 'bg-wine text-white' : 'bg-paper-card border border-paper-line'} ${m.attachment_url ? 'mt-1' : ''}`}>
                    {m.content}
                  </div>
                )}

                <span className="text-[9px] text-ink-soft mt-0.5 mx-1 flex items-center gap-1.5">
                  {readLabel && <span className="text-wine">{readLabel}</span>}
                  {formatTime(m.created_at)}
                  {(m.attachment_type === 'image' || m.attachment_type === 'video') && (
                    <button onClick={() => saveToAlbum(m)} className="underline text-ink-soft">📸保存</button>
                  )}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-wine text-[11px] text-center px-3">{error}</p>}

      {/* 入力（固定）。改行できるようテキストエリア。送信は➤ボタンのみ（Enterは改行） */}
      <form onSubmit={send} className="shrink-0 bg-paper-card border-t border-paper-line p-2 flex gap-2 items-end pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <input ref={fileRef} type="file" accept="image/*,video/*,*/*" className="hidden" onChange={pickFile} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={sending}
          className="text-xl w-9 h-9 shrink-0 rounded-full border border-paper-line text-wine disabled:opacity-40 mb-0.5">＋</button>
        <textarea ref={taRef} rows={1}
          className="flex-1 resize-none rounded-2xl border border-paper-line bg-white/70 px-4 py-2 text-sm leading-5 max-h-28 focus:outline-none focus:ring-2 focus:ring-wine/40"
          placeholder={sending ? '送信中…' : 'メッセージを入力（改行OK）'} value={text} maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px' }} />
        <button type="submit" disabled={!text.trim()} className="bg-wine text-white rounded-full w-10 h-10 shrink-0 disabled:opacity-40 mb-0.5">➤</button>
      </form>

      {/* 送信確認（LINE風の送信前プレビュー） */}
      {pending && (
        <Modal title="この内容を送信しますか？" onClose={() => setPending(null)}>
          <div className="flex justify-center mb-4">
            {pending.type === 'image' && <img src={pending.url} alt="プレビュー" className="max-h-72 rounded-xl object-contain" />}
            {pending.type === 'video' && <video src={pending.url} controls className="max-h-72 rounded-xl" />}
            {pending.type === 'file' && (
              <div className="bg-paper rounded-xl px-4 py-6 text-center">
                <div className="text-4xl mb-2">📎</div>
                <p className="text-sm break-words max-w-60">{pending.name}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <GhostButton className="flex-1" onClick={() => setPending(null)}>キャンセル</GhostButton>
            <PrimaryButton className="flex-1" onClick={confirmSend}>送信する</PrimaryButton>
          </div>
        </Modal>
      )}
    </div>
  )
}
