import { io } from 'socket.io-client';

/** Same-origin when unset so Vite/ngrok proxy can reach the local server. */
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

const isNgrok = /ngrok/.test(SERVER_URL);

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      // Free ngrok tunnels serve an HTML interstitial to any request that isn't
      // already "clicked through" in a real browser session. The skip header
      // bypasses it, but native WebSocket connections can't carry custom headers,
      // so on ngrok we stick to polling (plain HTTP requests) which can.
      transports: isNgrok ? ['polling'] : ['websocket', 'polling'],
      upgrade: !isNgrok,
      extraHeaders: isNgrok ? { 'ngrok-skip-browser-warning': 'true' } : undefined,
    });
  }
  return socket;
}

export function getServerUrl() {
  return SERVER_URL;
}

/** Bypasses the free ngrok interstitial page, which would otherwise return an
 * HTML warning page instead of JSON/websocket data for every request the app makes. */
export function ngrokHeaders() {
  return isNgrok ? { 'ngrok-skip-browser-warning': 'true' } : {};
}
