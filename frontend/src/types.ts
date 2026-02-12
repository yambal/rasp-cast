export interface Track {
  id: string;
  type: 'file' | 'url';
  path?: string;
  url?: string;
  title: string;
  artist: string;
  filename?: string;
}

export interface StatusResponse {
  version: string;
  isStreaming: boolean;
  isPlayingInterrupt: boolean;
  listeners: number;
  currentTrack: Track | null;
  totalTracks: number;
  currentIndex: number;
}

export interface PlaylistResponse {
  tracks: Track[];
}

export interface ScheduleProgram {
  id: string;
  name: string;
  cron: string;
  track: {
    type: 'file' | 'url';
    path?: string;
    url?: string;
    title?: string;
    artist?: string;
  };
  enabled: boolean;
  nextRun: string | null;
}

export interface ScheduleResponse {
  programs: ScheduleProgram[];
}
