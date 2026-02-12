import type { StatusResponse, PlaylistResponse, ScheduleResponse } from './types';

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch('/status');
  return res.json();
}

export async function fetchPlaylist(): Promise<PlaylistResponse> {
  const res = await fetch('/playlist');
  return res.json();
}

export async function fetchSchedule(): Promise<ScheduleResponse> {
  const res = await fetch('/schedule');
  return res.json();
}
