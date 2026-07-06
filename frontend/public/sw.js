// Service Worker（プロトタイプ用。主目的はWeb Push通知の受信とホーム画面追加）
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })

// プッシュ受信：
//  - アプリを開いて見ている間（visibleかつフォーカス中のウィンドウがある）はOS通知を出さず、
//    postMessageでページへ渡してアプリ内トーストとして表示する
//  - アプリを閉じている・バックグラウンドのときは従来どおりOS通知を表示する
//  - ただしiOS(Apple)は例外として常にOS通知を表示する。理由は2つ：
//    (1) iOSはバックグラウンドに回したPWAのclientがvisibilityState='visible'のまま
//        残る既知の挙動があり、「開いている」判定に使えない（誤判定で通知が消える）
//    (2) WebKitはプッシュ受信のたびに通知を表示することを必須としており、
//        表示しない受信（サイレントプッシュ）が続くと購読自体を取り消してしまう
self.addEventListener('push', (e) => {
  let data = { title: '推しログ', body: '', url: '/' }
  try { data = e.data.json() } catch { /* テキストのみのとき */ }
  e.waitUntil((async () => {
    const sub = await self.registration.pushManager.getSubscription()
    const isApple = !!(sub && sub.endpoint.startsWith('https://web.push.apple.com'))
    if (!isApple) {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // フォーカス中まで確認する（別ウィンドウの後ろに見えているだけ等の誤判定を防ぐ）
      const active = wins.filter((c) => c.visibilityState === 'visible' && c.focused)
      if (active.length > 0) {
        active.forEach((c) => c.postMessage({ type: 'push', ...data }))
        return
      }
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
