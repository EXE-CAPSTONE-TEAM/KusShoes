import type { AdminRole } from '../types/admin';

export interface AdminSession {
  role: Extract<AdminRole, 'admin' | 'staff'>;
  email: string;
  accessToken: string;
}

const LEGACY_STORAGE_KEY = 'kusshoes_admin_session';
export const ADMIN_SESSION_EXPIRED_EVENT = 'kusshoes:admin-session-expired';

let sessionInMemory: AdminSession | null = null;

function clearLegacySession(): void {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_STORAGE_KEY);
}

clearLegacySession();

export function getAdminSession(): AdminSession | null {
  clearLegacySession();
  return sessionInMemory;
}

export function saveAdminSession(session: AdminSession): void {
  sessionInMemory = session;
  clearLegacySession();
}

export function updateAccessToken(accessToken: string): void {
  const restored = sessionFromAccessToken(accessToken, sessionInMemory?.email);
  if (!restored) return;
  sessionInMemory = restored;
  clearLegacySession();
}

export function clearAdminSession(): void {
  sessionInMemory = null;
  clearLegacySession();
}

export function expireAdminSession(): void {
  clearAdminSession();
  window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
}

export function sessionFromAccessToken(
  accessToken: string,
  email = 'Active admin session',
): AdminSession | null {
  const role = roleFromAccessToken(accessToken);
  if (role !== 'admin' && role !== 'staff') return null;
  return { role, email, accessToken };
}

function roleFromAccessToken(accessToken: string): AdminSession['role'] | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded)) as { role?: string };
    return decoded.role === 'admin' || decoded.role === 'staff' ? decoded.role : null;
  } catch {
    return null;
  }
}
