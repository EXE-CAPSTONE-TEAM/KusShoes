/**
 * Where the KusShoes Editor (KusStudio Desktop) installer lives. The desktop repo's release
 * workflow publishes every version with a stable-name copy, so this URL always serves the
 * newest installer (prereleases such as the Blender runtime are never "latest").
 */
const DESKTOP_REPO = 'EXE-CAPSTONE-TEAM/ar-ai-exe';

export const DESKTOP_INSTALLER_URL =
  import.meta.env.VITE_DESKTOP_INSTALLER_URL ??
  `https://github.com/${DESKTOP_REPO}/releases/latest/download/KusShoesEditor-Setup-x64.exe`;

const LATEST_RELEASE_API = `https://api.github.com/repos/${DESKTOP_REPO}/releases/latest`;

export type DesktopRelease =
  /** A published installer; `version` like "0.1.0". */
  | { status: 'available'; version: string }
  /** GitHub answered that nothing is published yet. */
  | { status: 'none' }
  /** Could not ask (offline, rate limit): keep the download link, just without a version. */
  | { status: 'unknown' };

/** "desktop-v0.1.0" → "0.1.0"; anything else is not a desktop release tag. */
export function versionFromTag(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const match = /^desktop-v(\d+\.\d+\.\d+)$/.exec(tag.trim());
  return match ? match[1] : null;
}

let cached: Promise<DesktopRelease> | null = null;

export function fetchLatestDesktopRelease(fetcher: typeof fetch = fetch): Promise<DesktopRelease> {
  cached ??= (async (): Promise<DesktopRelease> => {
    try {
      const response = await fetcher(LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (response.status === 404) return { status: 'none' };
      if (!response.ok) return { status: 'unknown' };
      const version = versionFromTag(((await response.json()) as { tag_name?: unknown }).tag_name);
      return version ? { status: 'available', version } : { status: 'unknown' };
    } catch {
      return { status: 'unknown' };
    }
  })();
  return cached;
}

/** Test hook: forget the memoised lookup. */
export function resetDesktopReleaseCache(): void {
  cached = null;
  cachedAndroid = null;
}

const RELEASES_API = `https://api.github.com/repos/${DESKTOP_REPO}/releases?per_page=30`;
export const ANDROID_APK_NAME = 'KusShoes-Android.apk';

export type AndroidRelease =
  | { status: 'available'; version: string; url: string }
  | { status: 'none' }
  | { status: 'unknown' };

type GithubRelease = { tag_name?: unknown; draft?: boolean; prerelease?: boolean };

/** "mobile-v0.1.0" → "0.1.0". */
export function androidVersionFromTag(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  const match = /^mobile-v(\d+\.\d+\.\d+)$/.exec(tag.trim());
  return match ? match[1] : null;
}

let cachedAndroid: Promise<AndroidRelease> | null = null;

/**
 * Newest published Android APK. Mobile releases are deliberately never GitHub's "latest"
 * (that pointer serves the desktop installer and updater), so pick the newest `mobile-v*` tag
 * from the release list, which GitHub returns newest first.
 */
export function fetchLatestAndroidRelease(fetcher: typeof fetch = fetch): Promise<AndroidRelease> {
  cachedAndroid ??= (async (): Promise<AndroidRelease> => {
    try {
      const response = await fetcher(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) return { status: 'unknown' };
      const releases = (await response.json()) as GithubRelease[];
      for (const release of releases) {
        if (release.draft || release.prerelease) continue;
        const version = androidVersionFromTag(release.tag_name);
        if (version) {
          return {
            status: 'available',
            version,
            url: `https://github.com/${DESKTOP_REPO}/releases/download/mobile-v${version}/${ANDROID_APK_NAME}`,
          };
        }
      }
      return { status: 'none' };
    } catch {
      return { status: 'unknown' };
    }
  })();
  return cachedAndroid;
}
