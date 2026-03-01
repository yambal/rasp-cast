# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Backend (Express + TypeScript ESM)
npm run dev              # Dev server with tsx watch (:3000)
npm run build            # TypeScript → dist/
npm start                # Run compiled backend

# Frontend (React + Vite + Chakra UI v3)
npm run dev:frontend     # Vite dev server (:5173, proxies to :3000)
npm run build:frontend   # Vite build → frontend/dist/

# Full development: run both in parallel
```

**Production build & deploy**: version bump in package.json → `npm run build` → commit (including dist/) → push. Pi auto-pulls on service restart.

## Architecture

**Backend** (Express, `src/`): MP3 streaming server with ICY metadata protocol (SHOUTcast/Icecast compatible).

- `StreamManager` (881 lines) — core engine: MP3 streaming at 128kbps with TCP_NODELAY, ICY metadata interleaving at 8192-byte boundaries, URL track caching via ffmpeg with 2-pass loudness normalization (-14 LUFS), interrupt playback
- `ScheduleManager` — cron-based program scheduling (node-cron, Asia/Tokyo timezone)
- `IcyMetadata` — ICY protocol: 1-byte length prefix + 16-byte padded ASCII metadata blocks
- Routes: `/stream`, `/status`, `/playlist`, `/schedule`, `/interrupt`, `/cache`
- Auth: optional `API_KEY` via `Authorization: Bearer <key>` on mutation endpoints only

**Frontend** (`frontend/`): React 19 SPA with Chakra UI v3. URL parameter routing (`?admin`, `?api`). Hooks fetch from backend API. Audio player uses `/stream` endpoint directly.

**Deployment**: Pi (rasp-cast :3000) → WireGuard VPN → Oracle VM (nginx HTTPS :443) → public internet. Domain: fmets2jp.ipv64.de.

## Key Patterns

- **ESM modules** with `.js` extensions in imports, `"type": "module"`, Node16 module resolution
- **Strict TypeScript** with declaration files generated
- **dist/ is committed** — Pi pulls and runs compiled JS directly
- **Environment via `.env` file** on Pi (loaded by systemd EnvironmentFile), not committed
- **Data files** (`playlist.json`, `schedule.json`) are gitignored, managed via API
- **SECURITY.md** is gitignored (contains SSH keys and infrastructure credentials)

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_KEY` | (none) | Bearer token for admin endpoints. Empty = allow all |
| `PORT` | 3000 | Server port |
| `MUSIC_DIR` | `./music` | Local MP3 directory |
| `STATION_NAME` | YOUR STATION | Display name |
| `PUBLIC_STREAM_URL` | (none) | External stream URL shown in frontend |
| `PLAYLIST_PATH` | `./playlist.json` | Playlist file location |
| `SCHEDULE_PATH` | `./schedule.json` | Schedule file location |
| `CACHE_DIR` | `./cache` | URL track cache directory |

## Language

User communicates in Japanese. Respond in Japanese.
