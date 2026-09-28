import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../context/ToastContext';

vi.mock('../../../api/adminClient', async () => {
  const actual = await vi.importActual<typeof import('../../../api/adminClient')>('../../../api/adminClient');
  return { ...actual, adminUserActions: { setInternal: vi.fn() } };
});

import { adminUserActions } from '../../../api/adminClient';
import type { AdminUserSummary } from '../../../types/admin';
import { UserSupportActions } from './UserSupportActions';

afterEach(cleanup);

const user: AdminUserSummary = {
  id: 'u1',
  email: 'demo@kusshoes.vn',
  username: 'demo',
  account_code: 'KS-1',
  role: 'user',
  status: 'active',
  is_verified: true,
  is_internal: false,
  deleted_at: null,
  created_at: '2026-09-01T00:00:00Z',
};

describe('UserSupportActions internal flag (BR-83)', () => {
  it('marks the account internal after confirmation and reports the updated row', async () => {
    vi.mocked(adminUserActions.setInternal).mockResolvedValue({ status: 'updated', is_internal: true });
    const onUserChange = vi.fn();
    render(
      <ToastProvider>
        <UserSupportActions user={user} allowed onUserChange={onUserChange} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu tài khoản nội bộ' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Đánh dấu nội bộ' }));

    await waitFor(() => expect(onUserChange).toHaveBeenCalledWith({ ...user, is_internal: true }));
    expect(adminUserActions.setInternal).toHaveBeenCalledWith('u1', true);
  });

  it('is disabled for staff', () => {
    render(
      <ToastProvider>
        <UserSupportActions user={user} allowed={false} />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: 'Đánh dấu tài khoản nội bộ' })).toBeDisabled();
  });
});
