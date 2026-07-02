import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { getUser, saveUser, clearUser } from './api'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import Oshi from './pages/Oshi.jsx'
import Schedule from './pages/Schedule.jsx'
import Records from './pages/Records.jsx'
import Goods from './pages/Goods.jsx'
import Posts from './pages/Posts.jsx'

export default function App() {
  const [user, setUser] = useState(getUser)

  const handleLogin = (u) => {
    saveUser(u)
    setUser(u)
  }

  const handleLogout = () => {
    clearUser()
    setUser(null)
  }

  // 未ログインならログイン画面だけを表示
  if (!user) return <Login onLogin={handleLogin} />

  return (
    <BrowserRouter>
      <Layout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/oshi" element={<Oshi />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/records" element={<Records />} />
          <Route path="/goods" element={<Goods />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
