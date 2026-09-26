/** Small display helpers shared by the portal and admin pages. */

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} VNĐ`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

/**
 * Compact relative time: "just now" / "5m ago" / "2h ago" / "yesterday" / "3d ago", then an
 * absolute "Mon D" (or "Mon D, YYYY" once it's not this year). "yesterday" and the day count use
 * calendar-day differences, not raw 24h buckets, so 11:59pm-yesterday read at 12:01am is
 * "yesterday", not "just now" mislabeled as a day count.
 *
 * `now` is a parameter (not `Date.now()` inline) so tests can pass a fixed reference instead of
 * mocking the global clock.
 */
export function formatRelativeTime(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return '—';

  const diffSec = Math.floor((now.getTime() - ms) / 1000);
  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  // Same calendar day: show an hour bucket even if that's up to ~24h (e.g. 11:59pm vs 12:01am
  // is dayDiff 0 but could read almost 0h — diffMin already handled the sub-hour case above).
  if (dayDiff === 0) {
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}h ago`;
  }
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return `${dayDiff}d ago`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

/** "Chrome on Windows"-style label from a raw user agent, falling back to the raw text. */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? userAgent.slice(0, 40);
}
