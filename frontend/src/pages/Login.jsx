import { useState } from 'react'
import { api, getAccounts, removeAccount } from '../api'
import { PrimaryButton, inputClass, Avatar } from '../components/ui'

// ID＋パスワードのログイン／新規登録＋端末内アカウントのクイック選択（パスワードは保存しない）
export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState(getAccounts())
  // クイック選択中のアカウント（IDのみ自動入力。パスワードは毎回入力）
  const [picked, setPicked] = useState(accounts.length > 0 ? accounts[0] : null)

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const path = mode === 'login' ? '/login' : '/register'
      const body = mode === 'login'
        ? { username, password }
        : { username, password, display_name: displayName }
      const auth = await api(path, { method: 'POST', body })
      onLogin(auth)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pick = (acc) => { setPicked(acc); setUsername(acc.username); setError('') }
  const useAnother = () => { setPicked(null); setUsername(''); setPassword('') }
  const forget = (e, acc) => {
    e.stopPropagation()
    removeAccount(acc.username)
    const next = getAccounts()
    setAccounts(next)
    if (picked && picked.username === acc.username) { setPicked(next[0] || null); setUsername(next[0]?.username || '') }
  }

  const showQuick = mode === 'login' && accounts.length > 0 && picked

  return (
    <div className="h-[100dvh] bg-paper flex items-center justify-center p-6">
      {/* 手帳の表紙を開くように、カードがふわっと現れる */}
      <div className="fade-up w-full max-w-sm bg-paper-card rounded-3xl shadow-xl border border-paper-line p-8">
        <div className="text-center mb-6">
          {/* ロゴのハートはゆっくり鼓動する */}
          <div className="heart-beat text-5xl mb-2">💗</div>
          <h1 className="text-2xl font-black text-wine">推しログ</h1>
          <p className="text-xs text-ink-soft mt-1">推し活をつづる、わたしの手帳</p>
        </div>

        {/* ログイン／新規登録の切り替え */}
        <div className="grid grid-cols-2 bg-paper rounded-xl p-1 text-sm font-bold mb-5">
          <button className={`press rounded-lg py-1.5 transition-colors ${mode === 'login' ? 'bg-wine text-white' : 'text-ink-soft'}`}
            onClick={() => { setMode('login'); setError('') }}>ログイン</button>
          <button className={`press rounded-lg py-1.5 transition-colors ${mode === 'register' ? 'bg-wine text-white' : 'text-ink-soft'}`}
            onClick={() => { setMode('register'); setError(''); setPicked(null) }}>新規登録</button>
        </div>

        {showQuick ? (
          <>
            {/* この端末のアカウントをタップで選択（IDだけ自動入力、パスワードは入力） */}
            <p className="text-[11px] text-ink-soft mb-2">アカウントを選んでログイン</p>
            <div className="space-y-2 mb-3 stagger">
              {accounts.map((a) => (
                <button key={a.username} type="button" onClick={() => pick(a)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 ${picked.username === a.username ? 'border-wine bg-wine/5' : 'border-paper-line'}`}>
                  <Avatar image={a.avatar} name={a.display_name} size="w-9 h-9" textSize="text-sm" />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold truncate">{a.display_name}</p>
                    <p className="text-[10px] text-ink-soft truncate">@{a.username}</p>
                  </div>
                  <span onClick={(e) => forget(e, a)} className="text-ink-soft/60 text-lg px-1">×</span>
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input className={inputClass} type="password" placeholder={`${picked.display_name} のパスワード`} value={password}
                autoFocus onChange={(e) => setPassword(e.target.value)} />
              {error && <p className="text-wine text-xs">{error}</p>}
              <PrimaryButton className="w-full" disabled={loading || !password}>
                {loading ? '処理中...' : `${picked.display_name} でログイン`}
              </PrimaryButton>
            </form>
            <button onClick={useAnother} className="w-full text-center text-wine text-xs mt-4 underline">別のアカウントでログイン</button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input className={inputClass} placeholder="ユーザーID" value={username} maxLength={20}
              autoCapitalize="none" onChange={(e) => setUsername(e.target.value)} />
            {mode === 'register' && (
              <input className={inputClass} placeholder="表示名（ニックネーム）" value={displayName} maxLength={20}
                onChange={(e) => setDisplayName(e.target.value)} />
            )}
            <input className={inputClass} type="password" placeholder="パスワード（4文字以上）" value={password}
              onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-wine text-xs">{error}</p>}
            <PrimaryButton className="w-full" disabled={loading || !username.trim() || !password}>
              {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '登録してはじめる'}
            </PrimaryButton>
            {mode === 'login' && accounts.length > 0 && (
              <button type="button" onClick={() => setPicked(accounts[0])} className="w-full text-center text-wine text-xs underline">保存済みアカウントから選ぶ</button>
            )}
          </form>
        )}

        <p className="text-[11px] text-ink-soft mt-6 text-center leading-relaxed">
          パスワードは暗号化して保存されます。この端末のアカウント履歴に<b>パスワードは保存されません</b>。
          <br />メールアドレスは不要です。
        </p>
      </div>
    </div>
  )
}
