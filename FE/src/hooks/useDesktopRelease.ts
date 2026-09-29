import { useEffect, useState } from 'react';
import {
  fetchLatestAndroidRelease,
  fetchLatestDesktopRelease,
  type AndroidRelease,
  type DesktopRelease,
} from '../utils/desktopRelease';

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

/** Latest published Android APK; null while the lookup is in flight. */
export function useAndroidRelease(): AndroidRelease | null {
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  useEffect(() => {
    let active = true;
    void fetchLatestAndroidRelease().then((result) => {
      if (active) setRelease(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return release;
}
