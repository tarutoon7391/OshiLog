import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getUser, saveAuth, clearAuth, rememberAccount } from './api'
import { connectSocket, disconnectSocket } from './socket'
import { resyncPush } from './pwa'
import Layout from './components/Layout.jsx'
import PushToasts from './components/Toast.jsx'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import OshiBrowse from './pages/OshiBrowse.jsx'
import Calendar from './pages/Calendar.jsx'
import Records from './pages/Records.jsx'
import Goods from './pages/Goods.jsx'
import Events from './pages/Events.jsx'
import Friends from './pages/Friends.jsx'
import Chat from './pages/Chat.jsx'
import Posts from './pages/Posts.jsx'
import Diary from './pages/Diary.jsx'
import Profile from './pages/Profile.jsx'
import MyPage from './pages/MyPage.jsx'
import SavingsSupport from './pages/SavingsSupport.jsx'
import Blocks from './pages/Blocks.jsx'
import Admin from './pages/Admin.jsx'
import ClientMenu from './pages/ClientMenu.jsx'
import OshiDetail from './pages/OshiDetail.jsx'
import EventHistory from './pages/EventHistory.jsx'
import AlbumView from './pages/AlbumView.jsx'
import UserProfile from './pages/UserProfile.jsx'
import Notifications from './pages/Notifications.jsx'

export default function App() {
  const [user, setUser] = useState(getUser)

  // ログイン中はSocket.ioへ接続、ログアウトで切断
  // あわせて失効している可能性のあるプッシュ購読を自動修復する
  useEffect(() => {
    if (user) { connectSocket(); resyncPush() }
    else disconnectSocket()
  }, [user])

  const handleLogin = (auth) => { saveAuth(auth); rememberAccount(auth.user); setUser(auth.user) }
  const handleLogout = () => { disconnectSocket(); clearAuth(); setUser(null) }
  // プロフィール更新時に表示名・アイコンを反映
  const refreshUser = (u) => setUser(u)

  if (!user) return <Login onLogin={handleLogin} />

  return (
    <BrowserRouter>
      {/* アプリを開いている間のプッシュはアプリ内トーストで表示 */}
      <PushToasts />
      <Layout user={user}>
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/oshi" element={<OshiBrowse />} />
          <Route path="/oshi/:masterId" element={<OshiDetail />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/records" element={<Records />} />
          <Route path="/goods" element={<Goods />} />
          <Route path="/events" element={<Events user={user} />} />
          <Route path="/history" element={<EventHistory />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/users/:id" element={<UserProfile user={user} />} />
          <Route path="/chat/:roomId" element={<Chat user={user} />} />
          <Route path="/album/:roomId" element={<AlbumView user={user} />} />
          <Route path="/posts" element={<Posts user={user} />} />
          <Route path="/diary" element={<Diary />} />
          <Route path="/mypage" element={<MyPage user={user} />} />
          <Route path="/savings" element={<SavingsSupport />} />
          <Route path="/blocks" element={<Blocks />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile user={user} onLogout={handleLogout} onUpdate={refreshUser} />} />
          <Route path="/admin" element={user.is_admin ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="/guide" element={<ClientMenu />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
