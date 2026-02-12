import type { StatusResponse, PlaylistResponse } from './types';

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch('/status');
  return res.json();
}

export async function fetchPlaylist(): Promise<PlaylistResponse> {
  const res = await fetch('/playlist');
  return res.json();
}

export async function skipTrack(apiKey: string): Promise<void> {
  await fetch('/skip', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

export async function skipToTrack(apiKey: string, id: string): Promise<void> {
  await fetch(`/skip/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}
