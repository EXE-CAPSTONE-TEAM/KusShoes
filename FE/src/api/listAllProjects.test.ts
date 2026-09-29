import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

const project = (id: string) => ({
  id,
  name: id,
  status: 'draft',
  is_locked: false,
  design_config: {},
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  thumbnail_path: null,
  editor_url: null,
  description: null,
});

afterEach(() => vi.unstubAllGlobals());

describe('api.listAllProjects', () => {
  it('follows next_cursor until the last page', async () => {
    const pages: Record<string, unknown> = {
      '': { items: [project('a'), project('b')], next_cursor: 'c1', has_next: true },
      c1: { items: [project('c')], next_cursor: null, has_next: false },
    };
    const fetchMock = vi.fn(async (url: string) => {
      const cursor = new URL(url, 'http://x').searchParams.get('cursor') ?? '';
      return new Response(JSON.stringify(pages[cursor]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const projects = await api.listAllProjects();

    expect(projects.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
