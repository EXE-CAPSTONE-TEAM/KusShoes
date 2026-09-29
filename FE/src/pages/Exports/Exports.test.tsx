import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return { ...actual, api: { listExportHistory: vi.fn(), createExportDownloadUrl: vi.fn() } };
});

import { api, type ExportHistoryItem } from '../../api/client';
import { Exports } from './Exports';

const row = (id: string, overrides: Partial<ExportHistoryItem> = {}): ExportHistoryItem => ({
  id,
  project_id: `p-${id}`,
  project_name: `Shoe ${id}`,
  format: 'glb',
  file_size_bytes: 2 * 1024 * 1024,
  download_count: 0,
  is_watermarked: false,
  created_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, assign } });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

const renderExports = (onOpenProject = vi.fn()) =>
  render(
    <ToastProvider>
      <Exports onOpenProject={onOpenProject} />
    </ToastProvider>,
  );

describe('Exports page', () => {
  it('lists exports, pages with the cursor and downloads through a signed URL', async () => {
    vi.mocked(api.listExportHistory)
      .mockResolvedValueOnce({ items: [row('1', { is_watermarked: true })], nextCursor: 'c1', hasNext: true })
      .mockResolvedValueOnce({ items: [row('2', { format: 'obj' })], nextCursor: null, hasNext: false });
    vi.mocked(api.createExportDownloadUrl).mockResolvedValue('https://storage.example/file.glb');
    const onOpenProject = vi.fn();
    renderExports(onOpenProject);

    expect(await screen.findByText('Shoe 1')).toBeInTheDocument();
    expect(screen.getByText(/watermarked/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(await screen.findByText('Shoe 2')).toBeInTheDocument();
    expect(api.listExportHistory).toHaveBeenLastCalledWith({ cursor: 'c1', format: null });
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /download/i })[0]);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://storage.example/file.glb'));
    expect(api.createExportDownloadUrl).toHaveBeenCalledWith('1');

    fireEvent.click(screen.getAllByRole('button', { name: /project/i })[1]);
    expect(onOpenProject).toHaveBeenCalledWith('p-2');
  });

  it('shows the load error with a retry', async () => {
    vi.mocked(api.listExportHistory)
      .mockRejectedValueOnce(new Error('Server unavailable'))
      .mockResolvedValueOnce({ items: [], nextCursor: null, hasNext: false });
    renderExports();

    expect(await screen.findByText('Server unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText(/no exports yet/i)).toBeInTheDocument();
  });
});
