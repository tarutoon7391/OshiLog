import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, updateStoredUser } from '../api'
import { enablePush, pushPermission, isIOS, isStandalone } from '../pwa'
import { Card, Avatar, Field, inputClass, PrimaryButton, GhostButton, SectionTitle } from '../components/ui'

// プロフィール（表示名・アイコン・自己紹介）＋通知設定＋ログアウト
export default function Profile({ user, onLogout, onUpdate }) {
  const [displayName, setDisplayName] = useState(user.display_name || '')
  const [bio, setBio] = useState(user.bio || '')
  const [avatar, setAvatar] = useState(user.avatar || '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pushMsg, setPushMsg] = useState('')
  const [perm, setPerm] = useState(pushPermission())
  const nav = useNavigate()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('画像は2MB以下にしてください'); return }
    const reader = new FileReader()
    reader.onload = () => setAvatar(reader.result)
    reader.readAsDataURL(file)
  }

  const save = async (e) => {
    e.preventDefault(); setError(''); setSaved(false)
    try {
      const updated = await api('/me', { method: 'PUT', body: { display_name: displayName, bio, avatar: avatar || null } })
      updateStoredUser(updated)
      onUpdate(updated)
      setSaved(true)
    } catch (err) { setError(err.message) }
  }

  const turnOnPush = async () => {
    setPushMsg('')
    const r = await enablePush()
    setPerm(pushPermission())
    if (r.ok) setPushMsg('通知をオンにしました 🔔')
    else if (r.reason === 'denied') setPushMsg('通知はブロックされています（ブラウザ設定から許可できます）')
    else if (r.reason === 'unsupported') setPushMsg('この端末・ブラウザは通知に対応していません')
    else setPushMsg('通知を設定できませんでした')
  }

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-lg text-wine">プロフィール</h2>

      <Card>
        <form onSubmit={save}>
          <div className="flex flex-col items-center mb-3">
            <Avatar image={avatar} name={displayName || user.username} size="w-20 h-20" textSize="text-2xl" />
            <label className="text-xs text-wine underline mt-2 cursor-pointer">
              アイコンを変更
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
            {avatar && <button type="button" className="text-[11px] text-ink-soft underline mt-1" onClick={() => setAvatar('')}>アイコンを外す</button>}
          </div>
          <p className="text-[11px] text-ink-soft text-center mb-3">ユーザーID：{user.username}</p>
          <Field label="表示名">
            <input className={inputClass} value={displayName} maxLength={20} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="自己紹介">
            <textarea className={inputClass + ' resize-none'} rows={3} maxLength={200} value={bio}
              onChange={(e) => setBio(e.target.value)} placeholder="推し歴・担当・よろしくなど" />
          </Field>
          {error && <p className="text-wine text-xs mb-2">{error}</p>}
          {saved && <p className="text-[#5e7a5b] text-xs mb-2">保存しました ✓</p>}
          <PrimaryButton className="w-full">保存する</PrimaryButton>
        </form>
      </Card>

      {/* 通知設定 */}
      <Card>
        <SectionTitle>通知（Web Push）</SectionTitle>
        <p className="text-[11px] text-ink-soft mb-2">
          推し友のメッセージ・申請、参加イベントのリマインドをお知らせします。
        </p>
        {perm === 'granted'
          ? <p className="text-sm text-[#5e7a5b]">🔔 通知はオンです</p>
          : <PrimaryButton onClick={turnOnPush}>通知をオンにする</PrimaryButton>}
        {pushMsg && <p className="text-[11px] text-ink-soft mt-2">{pushMsg}</p>}
        {isIOS() && !isStandalone() && (
          <p className="text-[11px] text-wine mt-2 leading-relaxed">
            📱 iPhoneでは、Safariの共有ボタンから「ホーム画面に追加」すると通知が届くようになります。
          </p>
        )}
      </Card>

      {/* 管理者メニュー */}
      {user.is_admin && (
        <Card>
          <SectionTitle>管理者メニュー</SectionTitle>
          <GhostButton className="w-full" onClick={() => nav('/admin')}>🛠 イベント管理へ</GhostButton>
        </Card>
      )}

      <button onClick={onLogout} className="w-full text-center text-wine text-sm py-3 underline">ログアウト</button>
    </div>
  )
}
