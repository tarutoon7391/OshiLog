import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Card, Avatar, Empty, Loading, GhostButton } from '../components/ui'

// ブロックリスト：自分がブロック中のユーザーの確認と解除。
// 解除は既存の /users/:id/unblock API をそのまま利用する。
export default function Blocks() {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)
  const nav = useNavigate()

  const reload = () => api('/blocks').then(setRows).catch(() => setRows([]))
  useEffect(() => { reload() }, [])

  const unblock = async (u) => {
    if (!confirm(`${u.display_name || u.username}さんのブロックを解除しますか？`)) return
    setBusy(u.id)
    try { await api(`/users/${u.id}/unblock`, { method: 'POST' }); reload() }
    catch (err) { alert(err.message) }
    finally { setBusy(null) }
  }

  if (rows === null) return <Loading label="読み込み中…" />

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-lg text-wine">🚫 ブロックリスト</h2>
      <p className="text-[11px] text-ink-soft">
        ブロック中は、相手からのメッセージがあなたに届かなくなり、つぶやき・おすすめにも表示されません。
        推し友関係はそのまま残ります。解除はいつでもできます（ブロック中に送られたメッセージは解除後も表示されません）。
      </p>
      {rows.length === 0 ? (
        <Card><Empty icon="🕊️" message="ブロック中のユーザーはいません。" /></Card>
      ) : (
        rows.map((u) => (
          <Card key={u.id} className="p-3">
            <div className="flex items-center gap-3">
              <button onClick={() => nav(`/users/${u.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <Avatar image={u.avatar} name={u.display_name || u.username} size="w-10 h-10" textSize="text-sm" />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{u.display_name || u.username}</p>
                  <p className="text-[10px] text-ink-soft">@{u.username}</p>
                </div>
              </button>
              <GhostButton disabled={busy === u.id} onClick={() => unblock(u)}>解除</GhostButton>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
