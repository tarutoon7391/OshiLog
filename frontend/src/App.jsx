import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getUser, saveAuth, clearAuth } from './api'
import { connectSocket, disconnectSocket } from './socket'
import Layout from './components/Layout.jsx'
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
import Profile from './pages/Profile.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  const [user, setUser] = useState(getUser)

  // ログイン中はSocket.ioへ接続、ログアウトで切断
  useEffect(() => {
    if (user) connectSocket()
    else disconnectSocket()
  }, [user])

  const handleLogin = (auth) => { saveAuth(auth); setUser(auth.user) }
  const handleLogout = () => { disconnectSocket(); clearAuth(); setUser(null) }
  // プロフィール更新時に表示名・アイコンを反映
  const refreshUser = (u) => setUser(u)

  if (!user) return <Login onLogin={handleLogin} />

  return (
    <BrowserRouter>
      <Layout user={user}>
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/oshi" element={<OshiBrowse />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/records" element={<Records />} />
          <Route path="/goods" element={<Goods />} />
          <Route path="/events" element={<Events user={user} />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/chat/:roomId" element={<Chat user={user} />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="/profile" element={<Profile user={user} onLogout={handleLogout} onUpdate={refreshUser} />} />
          <Route path="/admin" element={user.is_admin ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
