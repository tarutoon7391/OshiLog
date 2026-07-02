// APIクライアント（トークン認証）
const KEY = 'oshilog_auth'

export function getAuth() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
export function saveAuth(a) { localStorage.setItem(KEY, JSON.stringify(a)) }
export function clearAuth() { localStorage.removeItem(KEY) }
export function getUser() { const a = getAuth(); return a ? a.user : null }
export function getToken() { const a = getAuth(); return a ? a.token : null }

// ログインユーザー情報だけを差し替える（プロフィール更新後など）
export function updateStoredUser(user) {
  const a = getAuth()
  if (a) saveAuth({ ...a, user })
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken()
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    if (res.status === 401) clearAuth()
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '通信エラーが発生しました')
  }
  return res.json()
}
