import { useState } from 'react'
import { api } from '../api'
import { PrimaryButton, inputClass } from '../components/ui'

// ID＋パスワードのログイン／新規登録（メールアドレス不要）
export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="h-[100dvh] bg-paper flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-paper-card rounded-3xl shadow-xl border border-paper-line p-8">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">💗</div>
          <h1 className="text-2xl font-black text-wine">推しログ</h1>
          <p className="text-xs text-ink-soft mt-1">推し活をつづる、わたしの手帳</p>
        </div>

        {/* ログイン／新規登録の切り替え */}
        <div className="grid grid-cols-2 bg-paper rounded-xl p-1 text-sm font-bold mb-5">
          <button className={`rounded-lg py-1.5 ${mode === 'login' ? 'bg-wine text-white' : 'text-ink-soft'}`}
            onClick={() => { setMode('login'); setError('') }}>ログイン</button>
          <button className={`rounded-lg py-1.5 ${mode === 'register' ? 'bg-wine text-white' : 'text-ink-soft'}`}
            onClick={() => { setMode('register'); setError('') }}>新規登録</button>
        </div>

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
        </form>

        <p className="text-[11px] text-ink-soft mt-6 text-center leading-relaxed">
          パスワードは暗号化して保存されます。
          <br />メールアドレスは不要です。
        </p>
      </div>
    </div>
  )
}
