import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminApiError } from '../api/adminClient';

interface UseAsyncDataResult<T> {
  data: T | null;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  return 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.';
}

export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  enabled = true,
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    fetcherRef.current(controller.signal)
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setData(result);
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { data, setData, loading, error, reload };
}
