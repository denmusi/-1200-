// Service Worker for ターゲット1200 クイズメカ (Apple Web Push & PWA)
const CACHE_NAME = 'target1200-cache-v1';

// インストール時は即座にアクティブ化
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// プッシュ通知の受信イベント
self.addEventListener('push', (event) => {
  let data = {
    title: 'ターゲット1200 通知',
    body: '新しいお知らせがあります',
    icon: './icon-192.png',
    badge: './icon-192.png',
    url: './index.html'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = Object.assign(data, parsed);
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || './icon-192.png',
    badge: data.badge || './icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || './index.html',
      testId: data.testId || null
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 通知タップ時の挙動（アプリを開き、トップ画面を表示）
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : './index.html', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既にアプリのウィンドウが開いていればフォーカス
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.indexOf('index.html') !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      // 開いていなければ新しく開く
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
