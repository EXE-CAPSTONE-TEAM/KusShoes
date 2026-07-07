import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminApiError } from '../api/adminClient';
import type { CursorPage } from '../types/admin';

interface UseCursorListOptions<T, Q extends object> {
  fetcher: (query: Q & { cursor?: string; limit?: number }, signal: AbortSignal) => Promise<CursorPage<T>>;
  query: Q;
  getId: (item: T) => string;
  limit?: number;
  enabled?: boolean;
}

interface UseCursorListResult<T> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  reload: () => void;
  loadMore: () => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  return 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.';
}

export function useCursorList<T, Q extends object>({
  fetcher,
  query,
  getId,
  limit = 20,
  enabled = true,
}: UseCursorListOptions<T, Q>): UseCursorListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const cursorRef = useRef<string | null>(null);
  cursorRef.current = cursor;

  const queryKey = JSON.stringify(query);

  const load = useCallback((append: boolean) => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);

    fetcher(
      { ...query, limit, cursor: append ? cursorRef.current ?? undefined : undefined },
      controller.signal,
    )
      .then((page) => {
        if (requestIdRef.current !== requestId) return;
        setItems((prev) => {
          if (!append) return page.items;
          const seen = new Set(prev.map(getId));
          return [...prev, ...page.items.filter((it) => !seen.has(getId(it)))];
        });
        setCursor(page.next_cursor);
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
        setLoadingMore(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, queryKey, limit, enabled, getId]);

  const reload = useCallback(() => load(false), [load]);
  const loadMore = useCallback(() => load(true), [load]);

  useEffect(() => {
    reload();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, enabled]);

  return { items, setItems, loading, loadingMore, error, hasMore: cursor !== null, reload, loadMore };
}
