import type { AdminRole } from '../types/admin';

export interface AdminSession {
  role: Extract<AdminRole, 'admin' | 'staff'>;
  email: string;
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = 'kusshoes_admin_session';
export const ADMIN_SESSION_EXPIRED_EVENT = 'kusshoes:admin-session-expired';

export function getAdminSession(): AdminSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    const isValid =
      (parsed.role === 'admin' || parsed.role === 'staff') &&
      typeof parsed.email === 'string' &&
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string';

    if (!isValid) {
      clearAdminSession();
      return null;
    }
    return parsed as AdminSession;
  } catch {
    clearAdminSession();
    return null;
  }
}

export function saveAdminSession(session: AdminSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function updateAccessToken(accessToken: string): void {
  const current = getAdminSession();
  if (!current) return;
  saveAdminSession({ ...current, accessToken });
}

export function clearAdminSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function expireAdminSession(): void {
  clearAdminSession();
  window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
}
