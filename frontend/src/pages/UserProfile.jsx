import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getSocket } from '../socket'
import { Card, Avatar, PrimaryButton, GhostButton, SectionTitle, Empty, Loading } from '../components/ui'

// 他ユーザーのプロフィール（つぶやき等からの遷移先）。推し友申請・ブロックができる。
// 非公開ユーザーの詳細（自己紹介・登録推し）は推し友以外には表示されない（サーバー側で判定）。
export default function UserProfile({ user }) {
  const { id } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => api(`/users/${id}/profile`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { setLoading(true); reload() }, [id])

  // 本人のプロフィールは編集画面へ
  useEffect(() => { if (data && data.is_self) nav('/profile', { replace: true }) }, [data])

  const request = async () => {
    setBusy(true)
    try { await api('/friends/request', { method: 'POST', body: { addressee_id: Number(id) } }); reload() }
    catch (err) { alert(err.message) }
    finally { setBusy(false) }
  }
  const accept = async () => {
    if (!data.incoming_friendship_id) return
    setBusy(true)
    try {
      await api(`/friends/${data.incoming_friendship_id}/accept`, { method: 'POST' })
      const s = getSocket(); if (s) s.emit('resync')
      reload()
    } catch (err) { alert(err.message) } finally { setBusy(false) }
  }
  const block = async () => {
    if (!confirm(`${data.display_name}さんをブロックしますか？\n推し友関係は解除され、以降はお互いのつぶやき・DM・おすすめから外れます。`)) return
    setBusy(true)
    try { await api(`/users/${id}/block`, { method: 'POST' }); reload() }
    catch (err) { alert(err.message) } finally { setBusy(false) }
  }
  const unblock = async () => {
    setBusy(true)
    try { await api(`/users/${id}/unblock`, { method: 'POST' }); reload() }
    catch (err) { alert(err.message) } finally { setBusy(false) }
  }

  if (loading) return <Loading label="プロフィールを読み込み中…" />
  if (error) return (
    <div className="text-center py-10">
      <p className="text-ink-soft text-sm">{error}</p>
      <button onClick={() => nav(-1)} className="text-wine text-sm underline mt-3">戻る</button>
    </div>
  )
  if (!data || data.is_self) return null

  return (
    <div className="space-y-3">
      <button onClick={() => nav(-1)} className="text-wine text-sm">‹ 戻る</button>

      <Card>
        <div className="flex flex-col items-center">
          <Avatar image={data.avatar} name={data.display_name} size="w-20 h-20" textSize="text-2xl" />
          <p className="font-bold text-lg text-ink mt-2">{data.display_name}</p>
          <p className="text-[11px] text-ink-soft">@{data.username}</p>
          {!data.is_public && <span className="text-[10px] bg-paper text-ink-soft rounded-full px-2 py-0.5 mt-1">🔒 非公開アカウント</span>}
        </div>

        {data.blocked_me ? (
          <p className="text-center text-[11px] text-ink-soft mt-3">このユーザーの情報は表示できません。</p>
        ) : data.can_see_detail ? (
          data.bio && <p className="text-sm text-ink whitespace-pre-wrap break-words mt-3 text-center">{data.bio}</p>
        ) : (
          <p className="text-center text-[11px] text-ink-soft mt-3">非公開アカウントのため、推し友になると自己紹介や推しが見られます。</p>
        )}

        {/* アクション */}
        <div className="mt-4 space-y-2">
          {data.is_friend && data.room_id && (
            <PrimaryButton className="w-full" onClick={() => nav(`/chat/${data.room_id}`)}>💬 トークする</PrimaryButton>
          )}
          {data.pending_incoming && (
            <PrimaryButton className="w-full" disabled={busy} onClick={accept}>推し友申請を承認する</PrimaryButton>
          )}
          {data.pending_outgoing && (
            <p className="text-center text-[11px] text-wine">推し友申請を送信済みです</p>
          )}
          {!data.is_friend && !data.pending_incoming && !data.pending_outgoing && !data.i_blocked && !data.blocked_me && (
            <PrimaryButton className="w-full" disabled={busy} onClick={request}>＋ 推し友申請</PrimaryButton>
          )}

          {data.i_blocked ? (
            <GhostButton className="w-full" disabled={busy} onClick={unblock}>ブロックを解除する</GhostButton>
          ) : (
            <button onClick={block} disabled={busy} className="w-full text-center text-[11px] text-ink-soft underline py-1">このユーザーをブロック</button>
          )}
        </div>
      </Card>

      {/* 登録している推し（詳細を見られる場合のみ） */}
      {data.can_see_detail && !data.blocked_me && (
        <Card>
          <SectionTitle>登録している推し</SectionTitle>
          {data.oshi.length === 0 ? (
            <Empty icon="⭐" message="まだ推しを登録していません" />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {data.oshi.map((o) => (
                <button key={o.oshi_master_id} onClick={() => o.oshi_master_id && nav(`/oshi/${o.oshi_master_id}`)}
                  className="flex flex-col items-center gap-1 shrink-0">
                  <Avatar image={o.image} name={o.name} color={o.color} />
                  <span className="text-[11px] text-ink-soft max-w-14 truncate">{o.name}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
