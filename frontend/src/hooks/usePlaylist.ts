import { useState, useEffect, useCallback } from 'react';
import type { Track } from '../types';
import { fetchPlaylist } from '../api';

export function usePlaylist(intervalMs = 5000) {
  const [tracks, setTracks] = useState<Track[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchPlaylist();
      setTracks(data.tracks);
    } catch (err) {
      console.error('[usePlaylist] fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { tracks, refresh };
}
