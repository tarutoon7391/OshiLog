import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from './pwa'
import { initTheme } from './theme'

// 保存済みのテーマカラーを描画前に適用（切り替え時のチラつき防止）
initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA用のService Workerを登録（通知・ホーム追加のため）
registerSW()
