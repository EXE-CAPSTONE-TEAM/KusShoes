export type SessionRole = 'user' | 'staff' | 'admin';

/** Reads the `role` claim of an access token (display/routing only; the server enforces access). */
export function roleFromAccessToken(accessToken: string | null): SessionRole | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const { role } = JSON.parse(atob(padded)) as { role?: string };
    return role === 'user' || role === 'staff' || role === 'admin' ? role : null;
  } catch {
    return null;
  }
}

export const isStaffRole = (role: SessionRole | null): boolean =>
  role === 'admin' || role === 'staff';
