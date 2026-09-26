import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import type { PortalProject, TrashedProject } from '../../api/client';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    api: {
      listTrash: vi.fn(),
      restoreProject: vi.fn(),
      permanentlyDeleteProject: vi.fn(),
    },
  };
});

import { api } from '../../api/client';
import { Trash } from './Trash';

const m = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

function makeTrashedProject(overrides: Partial<TrashedProject> = {}): TrashedProject {
  const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: 'p1',
    name: 'Air Max Remix',
    baseModel: 'Nike Air Max',
    status: 'Scanned',
    rawStatus: 'draft',
    isLocked: false,
    visibility: 'Private',
    updatedAt: '2026-08-01T00:00:00Z',
    createdAt: '2026-07-01T00:00:00Z',
    imageUrl: 'https://example.com/a.png',
    editorUrl: 'https://example.com/editor/a',
    device: 'iPhone 15',
    fileSize: '12 MB',
    photosCount: 5,
    verticesCount: '1,000',
    colorCode: '#FF5A36',
    description: '',
    deletedAt: '2026-09-20T00:00:00Z',
    purgeAt: inFiveDays,
    ...overrides,
  };
}

afterEach(cleanup);

describe('Trash', () => {
  it('renders the trashed projects from the API', async () => {
    m(api.listTrash).mockResolvedValue({
      items: [makeTrashedProject()],
      nextCursor: null,
      hasNext: false,
    });
    wrap(<Trash setProjects={vi.fn()} />);

    expect(await screen.findByText('Air Max Remix')).toBeInTheDocument();
    expect(screen.getByText(/5 days left/i)).toBeInTheDocument();
  });

  it('shows an empty state when trash has nothing in it', async () => {
    m(api.listTrash).mockResolvedValue({ items: [], nextCursor: null, hasNext: false });
    wrap(<Trash setProjects={vi.fn()} />);

    expect(await screen.findByText(/trash is empty/i)).toBeInTheDocument();
  });

  it('restores a project, removes it from the list, and merges it back into the main projects', async () => {
    const trashed = makeTrashedProject();
    m(api.listTrash).mockResolvedValue({ items: [trashed], nextCursor: null, hasNext: false });
    const restoredProject: PortalProject = {
      id: trashed.id,
      name: trashed.name,
      baseModel: trashed.baseModel,
      status: trashed.status,
      rawStatus: trashed.rawStatus,
      isLocked: trashed.isLocked,
      visibility: trashed.visibility,
      updatedAt: new Date().toISOString(),
      createdAt: trashed.createdAt,
      imageUrl: trashed.imageUrl,
      editorUrl: trashed.editorUrl,
      device: trashed.device,
      fileSize: trashed.fileSize,
      photosCount: trashed.photosCount,
      verticesCount: trashed.verticesCount,
      colorCode: trashed.colorCode,
      description: trashed.description,
    };
    m(api.restoreProject).mockResolvedValue(restoredProject);
    const setProjects = vi.fn();
    wrap(<Trash setProjects={setProjects} />);

    fireEvent.click(await screen.findByRole('button', { name: /restore/i }));

    await waitFor(() => expect(api.restoreProject).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.queryByText('Air Max Remix')).not.toBeInTheDocument());
    expect(await screen.findByText(/trash is empty/i)).toBeInTheDocument();

    await waitFor(() => expect(setProjects).toHaveBeenCalled());
    const updater = setProjects.mock.calls[0][0] as (prev: PortalProject[]) => PortalProject[];
    expect(updater([])).toEqual([restoredProject]);
  });

  it('requires confirmation before permanently deleting a project', async () => {
    m(api.listTrash).mockResolvedValue({ items: [makeTrashedProject()], nextCursor: null, hasNext: false });
    wrap(<Trash setProjects={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /delete forever/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/permanently delete this project/i)).toBeInTheDocument();
    expect(api.permanentlyDeleteProject).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /delete forever/i }));

    await waitFor(() => expect(api.permanentlyDeleteProject).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.queryByText('Air Max Remix')).not.toBeInTheDocument());
  });
});
