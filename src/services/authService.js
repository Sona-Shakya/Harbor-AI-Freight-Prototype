const TOKEN_KEY = 'harbor-auth-token';
const listeners = new Set();

function notify() {
  listeners.forEach(listener => listener(Boolean(sessionStorage.getItem(TOKEN_KEY))));
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (!token) throw new Error('A valid authentication token is required.');
  sessionStorage.setItem(TOKEN_KEY, token);
  notify();
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  notify();
}

export function hasToken() {
  return Boolean(getToken());
}

export function getAuthorizationHeader() {
  const token = getToken();
  return token ? {Authorization: `Bearer ${token}`} : {};
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function logout() {
  clearToken();
}
