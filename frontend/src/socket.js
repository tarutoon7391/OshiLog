// Socket.ioクライアント（同一オリジンに接続。トークンで認証）
import { io } from 'socket.io-client'
import { getToken } from './api'

let socket = null

export function connectSocket() {
  const token = getToken()
  if (!token) return null
  if (socket) { socket.disconnect(); socket = null }
  socket = io({ auth: { token } })
  return socket
}

export function getSocket() {
  if (!socket) return connectSocket()
  return socket
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null }
}
