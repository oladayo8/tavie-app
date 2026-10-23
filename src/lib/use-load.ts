import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { dataErrorMessage } from '@/lib/errors';

type State<T> = { data: T | null; loading: boolean; error: string | null };

/**
 * Loads data whenever the screen comes into view, so returning from an edit shows fresh rows.
 * `load` must be stable (wrap it in useCallback). Keeps the last good data if a reload fails.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });

  const reload = useCallback(async () => {
    try {
      const data = await load();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState((s) => ({ data: s.data, loading: false, error: dataErrorMessage(error as { message?: string }) }));
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    void reload();
  }, [reload]);

  return { ...state, reload, retry, setData: (data: T) => setState({ data, loading: false, error: null }) };
}
