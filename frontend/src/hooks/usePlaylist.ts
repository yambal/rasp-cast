import { useState, useEffect, useCallback } from 'react';
import type { Track } from '../types';
import { fetchPlaylist } from '../api';

export function usePlaylist() {
  const [tracks, setTracks] = useState<Track[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchPlaylist();
      setTracks(data.tracks);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tracks, refresh };
}
