import { io, Socket } from 'socket.io-client'

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000'

// Single shared socket instance for the SPA
const socket: Socket = io(SOCKET_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
})

export default socket
