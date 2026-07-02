// Service Worker（プロトタイプ用。主目的はWeb Push通知の受信とホーム画面追加）
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })

// プッシュ受信：
//  - アプリを開いて見ている間（visibleなウィンドウがある）はOS通知を出さず、
//    postMessageでページへ渡してアプリ内トーストとして表示する
//  - アプリを閉じている・バックグラウンドのときは従来どおりOS通知を表示する
self.addEventListener('push', (e) => {
  let data = { title: '推しログ', body: '', url: '/' }
  try { data = e.data.json() } catch { /* テキストのみのとき */ }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visible = wins.filter((c) => c.visibilityState === 'visible')
    if (visible.length > 0) {
      visible.forEach((c) => c.postMessage({ type: 'push', ...data }))
      return
    }
    await self.registration.showNotification(data.title || '推しログ', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  })())
})

// 通知タップでアプリを開く
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus() }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
