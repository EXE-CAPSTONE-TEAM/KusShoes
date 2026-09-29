import { useEffect, useState } from 'react';
import { bootDone, isBootFinished } from './boot';

/** true once the boot loader is gone (immediately true on later in-app navigation). */
export function useBootDone(): boolean {
  const [done, setDone] = useState(isBootFinished);
  useEffect(() => {
    if (done) return;
    let alive = true;
    void bootDone.then(() => {
      if (alive) setDone(true);
    });
    return () => {
      alive = false;
    };
  }, [done]);
  return done;
}
