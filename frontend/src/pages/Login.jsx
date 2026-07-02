import { useState } from 'react'
import { api } from '../api'
import { PrimaryButton, inputClass } from '../components/ui'

// ユーザー名だけで入れる簡易ログイン画面（プロトタイプ用）
export default function Login({ onLogin }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await api('/login', { method: 'POST', body: { username: name } })
      onLogin(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-400 via-pink-500 to-fuchsia-600 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
        <div className="text-5xl mb-2">💖</div>
        <h1 className="text-2xl font-black text-pink-600">推しログ</h1>
        <p className="text-xs text-gray-500 mt-1 mb-6">推し活をぜんぶ記録するアプリ</p>

        <form onSubmit={submit}>
          <input
            className={inputClass + ' text-center'}
            placeholder="ユーザー名を入力"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
          />
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
          <PrimaryButton className="w-full mt-4" disabled={loading || !name.trim()}>
            {loading ? '確認中...' : 'はじめる'}
          </PrimaryButton>
        </form>

        <p className="text-[11px] text-gray-400 mt-6">
          ※プロトタイプのためユーザー名のみでログインできます。
          <br />
          パスワードは不要です。
        </p>
      </div>
    </div>
  )
}
