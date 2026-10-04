import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { getAdminSession } from '../api/adminSession';
import { isStaffRole } from '../api/tokenRole';

/**
 * public: anyone. guest: the login screen, signed-in visitors are sent home.
 * user: customer portal. admin: back office (admin and staff).
 */
export type RouteKind = 'public' | 'guest' | 'user' | 'admin';

const USER_PAGES = new Set([
  'dashboard',
  'projects',
  'archives',
  'trash',
  'exports',
  'billing',
  'settings',
  'feedback',
  'project-details',
]);

export const USER_HOME = '/dashboard';
export const ADMIN_HOME = '/admin';
export const LOGIN_PATH = '/login';

export function routeKind(page: string): RouteKind {
  if (page === 'admin') return 'admin';
  if (page === 'login') return 'guest';
  return USER_PAGES.has(page) ? 'user' : 'public';
}

/** Where the visitor has to be sent for this route, or null when they may stay. */
async function redirectFor(kind: RouteKind): Promise<string | null> {
  if (kind === 'public') return null;

  // A back-office session lives in its own store; it never needs a refresh to be recognised.
  if (getAdminSession()) return kind === 'user' ? ADMIN_HOME : null;

  if (kind === 'admin' && !api.hasToken()) {
    // AdminApp restores the session from the refresh cookie, or shows its own login.
    return null;
  }

  const role = await api.restoreRole();
  if (isStaffRole(role)) {
    api.discardLocalToken();
    // The customer login never forwards staff to the admin app.
    return kind === 'user' ? ADMIN_HOME : null;
  }
  if (role === 'user') return kind === 'user' ? null : USER_HOME;
  // Signed out.
  return kind === 'user' ? LOGIN_PATH : null;
}

/**
 * Enforces role-based access for the current page. `redirect` replaces the URL (no history
 * entry). Returns whether the page content may be rendered yet.
 */
export function useRouteGuard(activePage: string, redirect: (path: string) => void): boolean {
  const kind = routeKind(activePage);
  const [verified, setVerified] = useState<RouteKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    redirectFor(kind).then((target) => {
      if (cancelled) return;
      if (target) {
        setVerified(null);
        redirect(target);
        return;
      }
      setVerified(kind === 'user' || kind === 'admin' ? kind : null);
    });
    return () => {
      cancelled = true;
    };
    // `redirect` is recreated every render; only the page decides when to re-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, activePage]);

  return kind === 'public' || kind === 'guest' || verified === kind;
}
