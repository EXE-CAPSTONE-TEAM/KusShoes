import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const restoreRole = vi.fn();
const hasToken = vi.fn();
const adminSession = vi.fn();

vi.mock('../api/client', () => ({
  api: {
    restoreRole: () => restoreRole(),
    hasToken: () => hasToken(),
    discardLocalToken: vi.fn(),
  },
}));
vi.mock('../api/adminSession', () => ({ getAdminSession: () => adminSession() }));

import { routeKind, useRouteGuard } from './routeGuard';

function guard(page: string) {
  const redirect = vi.fn();
  const view = renderHook(() => useRouteGuard(page, redirect));
  return { redirect, view };
}

describe('routeKind', () => {
  it('classifies pages', () => {
    expect(routeKind('dashboard')).toBe('user');
    expect(routeKind('project-details')).toBe('user');
    expect(routeKind('admin')).toBe('admin');
    expect(routeKind('login')).toBe('guest');
    expect(routeKind('landing')).toBe('public');
  });
});

describe('useRouteGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminSession.mockReturnValue(null);
    hasToken.mockReturnValue(false);
  });

  it('sends a signed-out visitor from the portal to login', async () => {
    restoreRole.mockResolvedValue(null);
    const { redirect, view } = guard('dashboard');
    await waitFor(() => expect(redirect).toHaveBeenCalledWith('/login'));
    expect(view.result.current).toBe(false);
  });

  it('sends an admin who signed in on the customer login to /admin', async () => {
    restoreRole.mockResolvedValue('admin');
    const { redirect } = guard('dashboard');
    await waitFor(() => expect(redirect).toHaveBeenCalledWith('/admin'));
  });

  it('lets a customer into the portal', async () => {
    restoreRole.mockResolvedValue('user');
    const { redirect, view } = guard('projects');
    await waitFor(() => expect(view.result.current).toBe(true));
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends a customer away from /admin to their dashboard', async () => {
    hasToken.mockReturnValue(true);
    restoreRole.mockResolvedValue('user');
    const { redirect } = guard('admin');
    await waitFor(() => expect(redirect).toHaveBeenCalledWith('/dashboard'));
  });

  it('sends an active admin session away from the portal', async () => {
    adminSession.mockReturnValue({ role: 'admin' });
    const { redirect } = guard('dashboard');
    await waitFor(() => expect(redirect).toHaveBeenCalledWith('/admin'));
  });

  it('does not forward staff from the login page to the admin app', async () => {
    restoreRole.mockResolvedValue('admin');
    const { redirect, view } = guard('login');
    await waitFor(() => expect(restoreRole).toHaveBeenCalled());
    expect(redirect).not.toHaveBeenCalled();
    expect(view.result.current).toBe(true);
  });

  it('redirects a signed-in customer off the login page', async () => {
    restoreRole.mockResolvedValue('user');
    const { redirect } = guard('login');
    await waitFor(() => expect(redirect).toHaveBeenCalledWith('/dashboard'));
  });

  it('keeps the login page open for a signed-out visitor', async () => {
    restoreRole.mockResolvedValue(null);
    const { redirect, view } = guard('login');
    await waitFor(() => expect(restoreRole).toHaveBeenCalled());
    expect(redirect).not.toHaveBeenCalled();
    expect(view.result.current).toBe(true);
  });
});
