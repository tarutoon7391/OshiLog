// PWA・Web Push まわりのヘルパー
import { api } from './api'

// Service Workerを登録する（通知やホーム追加のため）
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (e) {
    console.warn('SW登録に失敗:', e)
    return null
  }
}

// iOSでホーム画面に追加済み（スタンドアロン起動）かどうか
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// 通知を有効化する（許可取得→購読→サーバー登録）。拒否されても例外にはしない
export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: 'denied' }

  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await api('/push/vapid')
  if (!publicKey) return { ok: false, reason: 'no-key' }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  await api('/push/subscribe', { method: 'POST', body: { subscription: sub } })
  return { ok: true }
}

export function pushPermission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'default'
}
