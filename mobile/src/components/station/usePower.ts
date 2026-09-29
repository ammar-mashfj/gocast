import { useState } from 'react';

import { api, ApiError } from '../../lib/api';
import { errorText } from '../../lib/station';

type Confirm = { kind: 'off' } | { kind: 'force'; message: string } | null;

/** Start AutoDJ and turn off, with the web's force-stop confirmation for a live encoder. */
export function usePower(slug: string, onChanged: () => Promise<void>) {
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const start = async () => {
    setBusy('start');
    setError(null);
    try {
      await api(`/stations/${slug}/start`, { method: 'POST' });
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const stop = async (force = false) => {
    setBusy('stop');
    setError(null);
    try {
      await api(`/stations/${slug}/stop`, { method: 'POST', body: force ? { force: true } : undefined });
      setConfirm(null);
      await onChanged();
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { code?: string } | null)?.code : undefined;
      if (code === 'station_is_live_external' && !force) setConfirm({ kind: 'force', message: errorText(err) });
      else {
        setConfirm(null);
        setError(errorText(err));
      }
    } finally {
      setBusy(null);
    }
  };

  return { busy, error, confirm, setConfirm, start, stop };
}

export type Power = ReturnType<typeof usePower>;
