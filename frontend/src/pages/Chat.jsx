import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { formatTime } from '../util'
import { Avatar } from '../components/ui'

// チャット画面（DM・イベント共通。Socket.ioでリアルタイム）
export default function Chat({ user }) {
  const { roomId } = useParams()
  const nav = useNavigate()
  const [room, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef(null)
  const rid = Number(roomId)

  useEffect(() => {
    // ルーム情報（タイトル等）を一覧から取得
    api('/chat/rooms').then((rooms) => {
      const found = rooms.find((r) => r.id === rid)
      if (!found) { setError('このトークにアクセスできません'); return }
      setRoom(found)
    }).catch(() => setError('読み込みに失敗しました'))

    // 履歴を取得
    api(`/chat/rooms/${rid}/messages`)
      .then(setMessages)
      .catch((e) => setError(e.message))

    // リアルタイム受信
    const s = getSocket()
    if (s) {
      s.emit('resync') // このルームへ確実にjoin
      const onMsg = (m) => {
        if (m.room_id !== rid) return
        setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m])
      }
      s.on('chat:message', onMsg)
      return () => s.off('chat:message', onMsg)
    }
  }, [rid])

  // 新着で最下部へスクロール
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = (e) => {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    const s = getSocket()
    if (!s) { setError('接続がありません'); return }
    s.emit('chat:send', { roomId: rid, content }, (res) => {
      if (res && res.error) setError(res.error)
    })
    setText('')
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-ink-soft text-sm">{error}</p>
        <button onClick={() => nav(-1)} className="text-wine text-sm underline mt-3">戻る</button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col -m-4">
      {/* ルームヘッダー */}
      <div className="shrink-0 bg-paper-card border-b border-paper-line px-3 py-2 flex items-center gap-2">
        <button onClick={() => nav(-1)} className="text-wine text-lg px-1">‹</button>
        <span className="text-lg">{room?.type === 'event' ? '🎪' : '💬'}</span>
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{room?.title || 'トーク'}</p>
          {room?.type === 'event' && <p className="text-[10px] text-ink-soft">参加者 {room.member_count}人のグループトーク</p>}
        </div>
      </div>

      {/* メッセージ（この領域だけスクロール） */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-area px-3 py-3 space-y-2">
        {messages.length === 0 && <p className="text-center text-ink-soft text-xs py-6">まだメッセージがありません。<br />最初のひとことを送ってみましょう！</p>}
        {messages.map((m) => {
          const mine = m.sender_id === user.id
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && <Avatar image={m.sender_avatar} name={m.sender_name} size="w-7 h-7" textSize="text-xs" />}
              <div className={`max-w-[70%] min-w-0 ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                {!mine && <span className="text-[10px] text-ink-soft ml-1">{m.sender_name}</span>}
                <div className={`max-w-full rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap ${mine ? 'bg-wine text-white' : 'bg-paper-card border border-paper-line'}`}>
                  {m.content}
                </div>
                <span className="text-[9px] text-ink-soft mt-0.5 mx-1">{formatTime(m.created_at)}</span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* 入力（固定） */}
      <form onSubmit={send} className="shrink-0 bg-paper-card border-t border-paper-line p-2 flex gap-2">
        <input className="flex-1 rounded-full border border-paper-line bg-white/70 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine/40"
          placeholder="メッセージを入力" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        <button type="submit" disabled={!text.trim()} className="bg-wine text-white rounded-full w-10 h-10 shrink-0 disabled:opacity-40">➤</button>
      </form>
    </div>
  )
}
