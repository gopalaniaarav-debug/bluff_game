import { io } from 'socket.io-client';

/** Same-origin when unset so Vite/ngrok proxy can reach the local server. */
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function getServerUrl() {
  return SERVER_URL;
}
