import { useState, useEffect } from 'react';
import type { StatusResponse } from '../types';
import { fetchStatus } from '../api';

export function useStatus(intervalMs = 3000) {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const data = await fetchStatus();
        if (active) setStatus(data);
      } catch {
        // ignore fetch errors, retry on next interval
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return status;
}
