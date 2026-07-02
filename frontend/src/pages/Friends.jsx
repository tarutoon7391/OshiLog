import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { formatTime } from '../util'
import { Card, Avatar, PrimaryButton, GhostButton, Empty, SectionTitle, Loading } from '../components/ui'

// 推し友：おすすめマッチング・申請・推し友一覧（トークへの入口）＋チャット一覧
export default function Friends() {
  const [tab, setTab] = useState('friends') // friends | discover | requests | chats
  const [friends, setFriends] = useState([])
  const [recos, setRecos] = useState([])
  const [requests, setRequests] = useState([])
  const [rooms, setRooms] = useState([])
  const [busy, setBusy] = useState(null)
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  const reload = () => {
    Promise.allSettled([
      api('/friends').then(setFriends),
      api('/friends/recommendations').then(setRecos),
      api('/friends/requests').then(setRequests),
      api('/chat/rooms').then(setRooms),
    ]).finally(() => setLoading(false))
  }
  useEffect(() => {
    reload()
    // 申請受信・承認をリアルタイムで反映
    const s = getSocket()
    if (s) {
      const onReq = () => api('/friends/requests').then(setRequests).catch(() => {})
      const onAcc = () => reload()
      s.on('friend:request', onReq)
      s.on('friend:accepted', onAcc)
      return () => { s.off('friend:request', onReq); s.off('friend:accepted', onAcc) }
    }
  }, [])

  const request = async (u) => {
    setBusy(u.id)
    try { await api('/friends/request', { method: 'POST', body: { addressee_id: u.id } }); reload() }
    catch (err) { alert(err.message) }
    finally { setBusy(null) }
  }
  const accept = async (f) => {
    await api(`/friends/${f.friendship_id}/accept`, { method: 'POST' })
    const s = getSocket(); if (s) s.emit('resync')
    reload()
  }
  const reject = async (f) => {
    await api(`/friends/${f.friendship_id}/reject`, { method: 'POST' }); reload()
  }

  const TabBtn = ({ id, label, badge }) => (
    <button onClick={() => setTab(id)}
      className={`relative rounded-lg py-1.5 text-xs font-bold ${tab === id ? 'bg-wine text-white' : 'text-ink-soft'}`}>
      {label}
      {badge > 0 && <span className="absolute -top-1 -right-1 bg-wine text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center border border-paper-card">{badge}</span>}
    </button>
  )

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-lg text-wine">推し友</h2>

      <div className="grid grid-cols-4 bg-paper rounded-xl p-1 gap-1">
        <TabBtn id="friends" label="推し友" />
        <TabBtn id="discover" label="さがす" />
        <TabBtn id="requests" label="申請" badge={requests.length} />
        <TabBtn id="chats" label="トーク" badge={rooms.reduce((n, r) => n + (r.unread_count || 0), 0)} />
      </div>

      {loading && <Loading label="読み込み中…" />}

      {/* 推し友一覧 */}
      {tab === 'friends' && (
        <>
          {!loading && friends.length === 0 && <Card><Empty icon="👥" message={'まだ推し友がいません。\n「さがす」から同じ推しの人を見つけましょう！'} /></Card>}
          {friends.map((f) => (
            <Card key={f.id} className="flex items-center gap-3">
              <Avatar image={f.avatar} name={f.display_name} />
              <p className="flex-1 font-bold text-sm truncate">{f.display_name}</p>
              {f.room_id && <PrimaryButton onClick={() => nav(`/chat/${f.room_id}`)}>💬 トーク</PrimaryButton>}
            </Card>
          ))}
        </>
      )}

      {/* おすすめマッチング */}
      {tab === 'discover' && (
        <>
          <SectionTitle>同じ推しの人をおすすめ</SectionTitle>
          {!loading && recos.length === 0 && <Card><Empty icon="🔍" message={'おすすめが見つかりませんでした。\n推しを登録すると同担の人が表示されます。'} /></Card>}
          {recos.map((u) => (
            <Card key={u.id} className="flex items-center gap-3">
              <Avatar image={u.avatar} name={u.display_name} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{u.display_name}</p>
                <p className="text-[11px] text-ink-soft truncate">
                  {u.shared_oshi.filter(Boolean).join('・')} を推しています
                </p>
              </div>
              <PrimaryButton disabled={busy === u.id} onClick={() => request(u)}>申請</PrimaryButton>
            </Card>
          ))}
        </>
      )}

      {/* 受け取った申請 */}
      {tab === 'requests' && (
        <>
          {!loading && requests.length === 0 && <Card><Empty icon="📨" message="届いている申請はありません" /></Card>}
          {requests.map((f) => (
            <Card key={f.friendship_id} className="flex items-center gap-3">
              <Avatar image={f.avatar} name={f.display_name} />
              <p className="flex-1 font-bold text-sm truncate">{f.display_name}</p>
              <PrimaryButton onClick={() => accept(f)}>承認</PrimaryButton>
              <GhostButton onClick={() => reject(f)}>拒否</GhostButton>
            </Card>
          ))}
        </>
      )}

      {/* トーク一覧（DM・イベント） */}
      {tab === 'chats' && (
        <>
          {!loading && rooms.length === 0 && <Card><Empty icon="💬" message={'トークがありません。\n推し友になるか、イベントに参加すると始まります。'} /></Card>}
          {rooms.map((r) => (
            <button key={r.id} onClick={() => nav(`/chat/${r.id}`)}
              className="w-full text-left">
              <Card className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0 ${r.type === 'event' ? 'bg-wine/15' : 'bg-paper'}`}>
                  {r.type === 'event' ? '🎪' : '💬'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">
                    {r.title || '（無名）'}
                    {r.type === 'event' && <span className="text-[10px] text-ink-soft ml-1">👥{r.member_count}</span>}
                  </p>
                  <p className="text-[11px] text-ink-soft truncate">{r.last_message || 'メッセージはまだありません'}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {r.last_at && <span className="text-[10px] text-ink-soft">{formatTime(r.last_at)}</span>}
                  {r.unread_count > 0 && <span className="bg-wine text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">{r.unread_count}</span>}
                </div>
              </Card>
            </button>
          ))}
        </>
      )}
    </div>
  )
}
