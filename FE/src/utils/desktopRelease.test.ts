import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  androidVersionFromTag,
  DESKTOP_INSTALLER_URL,
  fetchLatestAndroidRelease,
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

describe('android release', () => {
  beforeEach(() => resetDesktopReleaseCache());

  it('parses only mobile release tags', () => {
    expect(androidVersionFromTag('mobile-v0.1.0')).toBe('0.1.0');
    expect(androidVersionFromTag('desktop-v0.1.0')).toBeNull();
  });

  it('picks the newest published mobile release, skipping desktop, drafts and prereleases', async () => {
    const fetcher = respond(200, [
      { tag_name: 'desktop-v0.2.0' },
      { tag_name: 'mobile-v0.3.0', draft: true },
      { tag_name: 'blender-runtime-4.5.1', prerelease: true },
      { tag_name: 'mobile-v0.2.1' },
      { tag_name: 'mobile-v0.1.0' },
    ]);
    expect(await fetchLatestAndroidRelease(fetcher)).toEqual({
      status: 'available',
      version: '0.2.1',
      url: 'https://github.com/EXE-CAPSTONE-TEAM/ar-ai-exe/releases/download/mobile-v0.2.1/KusShoes-Android.apk',
    });
  });

  it('reports none when no mobile release exists and unknown when GitHub is unreachable', async () => {
    expect(await fetchLatestAndroidRelease(respond(200, [{ tag_name: 'desktop-v0.1.0' }]))).toEqual({ status: 'none' });
    resetDesktopReleaseCache();
    expect(await fetchLatestAndroidRelease(respond(403))).toEqual({ status: 'unknown' });
  });
});
