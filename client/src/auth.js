const SESSION_KEY = 'bluff_session';

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(partial) {
  const current = loadSession() ?? {};
  const next = { ...current, ...partial };
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return next;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function clearRoomSession() {
  const s = loadSession();
  if (!s) return;
  const { authToken, displayName, userId } = s;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ authToken, displayName, userId }));
}

export function authHeaders() {
  const s = loadSession();
  if (!s?.authToken) return {};
  return { Authorization: `Bearer ${s.authToken}` };
}

function getApiBase() {
  return import.meta.env.VITE_SERVER_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');
}

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.ok
        ? 'Invalid server response'
        : 'Server unavailable — restart the game server and refresh the page'
    );
  }
}

export async function apiRegister(displayName, password) {
  const res = await fetch(`${getApiBase()}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, password }),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  saveSession({
    authToken: data.token,
    displayName: data.user.displayName,
    userId: data.user.id,
  });
  return data;
}

export async function apiLogin(displayName, password) {
  const res = await fetch(`${getApiBase()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, password }),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error || 'Login failed');
  saveSession({
    authToken: data.token,
    displayName: data.user.displayName,
    userId: data.user.id,
  });
  return data;
}

export async function apiLogout() {
  try {
    await fetch(`${getApiBase()}/api/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    });
  } catch {
    /* ignore */
  }
  clearSession();
}

export async function apiMe() {
  const res = await fetch(`${getApiBase()}/api/auth/me`, { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await parseJsonResponse(res);
  return data.user;
}
