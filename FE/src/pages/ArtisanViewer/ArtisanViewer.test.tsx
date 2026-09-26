import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { ArtisanViewer } from './ArtisanViewer';

// The public viewer must never rely on the portal's authenticated fetch helper: it is
// reached by an anonymous recipient, so the network layer here is a bare `fetch` mock.
const wrap = (ui: React.ReactElement) => render(<ThemeProvider><ToastProvider>{ui}</ToastProvider></ThemeProvider>);

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const VIEW = {
  project_name: 'Sneaker Bespoke #12',
  format: 'GLB',
  expires_at: '2026-12-31T00:00:00Z',
  downloads_remaining: 3,
};

describe('ArtisanViewer (public share link, BR-101)', () => {
  it('renders the project details for a valid link, without sending credentials', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VIEW));

    wrap(<ArtisanViewer token="good-token" />);

    expect(await screen.findByText('Sneaker Bespoke #12')).toBeInTheDocument();
    expect(screen.getByText('GLB')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:8000/api/v1/public/artisan/good-token');
    expect(options?.credentials).toBe('omit');
    const headers = (options?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('shows the invalid-link state on a 410 ARTISAN_LINK_INVALID response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(410, {
        code: 'ARTISAN_LINK_INVALID',
        message: 'Link không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ chủ thiết kế để lấy link mới',
      }),
    );

    wrap(<ArtisanViewer token="dead-token" />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Link không hợp lệ/)).toBeInTheDocument();
    expect(screen.queryByText('Sneaker Bespoke #12')).not.toBeInTheDocument();
  });

  it('downloads via the POST endpoint and opens the returned URL', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, VIEW))
      .mockResolvedValueOnce(
        jsonResponse(200, { download_url: 'https://storage.example.com/signed/file.glb', expires_in_seconds: 900 }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ...VIEW, downloads_remaining: 2 }));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    wrap(<ArtisanViewer token="good-token" />);
    await screen.findByText('Sneaker Bespoke #12');

    fireEvent.click(screen.getByRole('button', { name: /Download/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [downloadUrl, downloadOptions] = fetchMock.mock.calls[1];
    expect(String(downloadUrl)).toBe('http://localhost:8000/api/v1/public/artisan/good-token/download');
    expect(downloadOptions?.method).toBe('POST');
    expect(openSpy).toHaveBeenCalledWith('https://storage.example.com/signed/file.glb', '_blank', 'noopener');

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });
});
