import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_INSTALLER_URL,
  fetchLatestDesktopRelease,
  resetDesktopReleaseCache,
  versionFromTag,
} from './desktopRelease';

const respond = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('desktop release', () => {
  beforeEach(() => resetDesktopReleaseCache());

  it('links to the stable-name installer of the latest release', () => {
    expect(DESKTOP_INSTALLER_URL).toBe(
      'https://github.com/EXE-CAPSTONE-TEAM/ar-ai-exe/releases/latest/download/KusShoesEditor-Setup-x64.exe',
    );
  });

  it('parses only desktop release tags', () => {
    expect(versionFromTag('desktop-v0.1.0')).toBe('0.1.0');
    expect(versionFromTag('blender-runtime-4.5.1')).toBeNull();
    expect(versionFromTag('v1.4.2')).toBeNull();
    expect(versionFromTag(undefined)).toBeNull();
  });

  it('reports the published version and memoises the lookup', async () => {
    const fetcher = respond(200, { tag_name: 'desktop-v0.2.3' });
    expect(await fetchLatestDesktopRelease(fetcher)).toEqual({ status: 'available', version: '0.2.3' });
    await fetchLatestDesktopRelease(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('distinguishes "nothing published" from "could not ask"', async () => {
    expect(await fetchLatestDesktopRelease(respond(404))).toEqual({ status: 'none' });
    resetDesktopReleaseCache();
    expect(await fetchLatestDesktopRelease(respond(403))).toEqual({ status: 'unknown' });
    resetDesktopReleaseCache();
    const offline = vi.fn(async () => {
      throw new TypeError('network');
    });
    expect(await fetchLatestDesktopRelease(offline)).toEqual({ status: 'unknown' });
  });
});
