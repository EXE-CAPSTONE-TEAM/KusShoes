import { useEffect, useState } from 'react';
import { fetchLatestDesktopRelease, type DesktopRelease } from '../utils/desktopRelease';

/** Latest published desktop release; null while the lookup is in flight. */
export function useDesktopRelease(): DesktopRelease | null {
  const [release, setRelease] = useState<DesktopRelease | null>(null);
  useEffect(() => {
    let active = true;
    void fetchLatestDesktopRelease().then((result) => {
      if (active) setRelease(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return release;
}
