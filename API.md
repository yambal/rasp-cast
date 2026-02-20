# API リファレンス

## 概要

Rasp-Cast は REST API でストリーム配信とプレイリスト管理を行います。

- **ベース URL**: `http://<HOST>:3000`
- **レスポンス形式**: JSON（`/stream` を除く）
- 管理系エンドポイントは API キー認証が必要です

## 認証

管理系エンドポイント（`POST`, `PUT`, `DELETE`）は Bearer トークン認証が必要です。

```
Authorization: Bearer <API_KEY>
```

API キーは環境変数 `API_KEY` または `.env` ファイルで設定します。未設定時は全リクエスト許可（開発用）。

---

## エンドポイント一覧

| メソッド | URL | 認証 | 説明 |
|---|---|---|---|
| GET | `/stream` | 不要 | MP3 ストリーム |
| GET | `/status` | 不要 | 配信状態 |
| GET | `/playlist` | 不要 | プレイリスト取得 |
| GET | `/cache` | 不要 | キャッシュ状態 |
| GET | `/schedule` | 不要 | スケジュール番組一覧 |
| GET | `/api-docs` | 不要 | API リファレンス（text/plain） |
| POST | `/skip` | 必要 | 次の曲へスキップ |
| POST | `/skip/:id` | 必要 | 指定トラックへジャンプ |
| PUT | `/playlist` | 必要 | プレイリスト全置換 |
| POST | `/playlist/tracks` | 必要 | トラック追加 |
| DELETE | `/playlist/tracks/:id` | 必要 | トラック削除 |
| POST | `/cache/cleanup` | 必要 | キャッシュ整合性チェック＆クリーンアップ |
| POST | `/interrupt` | 必要 | 割り込み再生 |
| POST | `/schedule/programs` | 必要 | スケジュール番組追加 |
| PUT | `/schedule/programs/:id` | 必要 | スケジュール番組更新 |
| DELETE | `/schedule/programs/:id` | 必要 | スケジュール番組削除 |

---

## GET /stream

MP3 オーディオストリームを返します。SHOUTcast/Icecast 互換の ICY プロトコルに対応しています。

### レスポンスヘッダー

```
Content-Type: audio/mpeg
Connection: keep-alive
icy-name: Rasp-Cast
icy-genre: Mixed
icy-br: 128
```

### ICY メタデータ

リクエストヘッダーに `Icy-MetaData: 1` を含めると、8192 バイト間隔でメタデータが挿入されます。

```
Icy-MetaData: 1
```

追加レスポンスヘッダー:
```
icy-metaint: 8192
```

### 使用例

```bash
# ブラウザ / VLC
http://localhost:3000/stream

# curl で ICY メタデータ付き
curl -H "Icy-MetaData: 1" http://localhost:3000/stream > /dev/null
```

---

## GET /status

現在の配信状態を JSON で返します。

### レスポンス

```json
{
  "version": "0.4.9",
  "isStreaming": true,
  "isPlayingInterrupt": false,
  "listeners": 2,
  "currentTrack": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Song Title",
    "artist": "Artist Name",
    "filename": "song.mp3"
  },
  "totalTracks": 10,
  "currentIndex": 3,
  "stationName": "FM ETS2 JP",
  "streamUrl": "http://your-server:8000/stream",
  "busy": true,
  "pendingCaches": 2
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `version` | string | サーバーバージョン |
| `isStreaming` | boolean | 配信中かどうか |
| `isPlayingInterrupt` | boolean | 割り込み再生中かどうか |
| `listeners` | number | 接続中のリスナー数 |
| `currentTrack` | object \| null | 現在再生中のトラック |
| `totalTracks` | number | プレイリストの総トラック数 |
| `currentIndex` | number | 現在の再生位置（0始まり） |
| `stationName` | string | 局名（環境変数 `STATION_NAME`） |
| `streamUrl` | string | 公開ストリーム URL（環境変数 `PUBLIC_STREAM_URL`、未設定時は空文字） |
| `busy` | boolean | キャッシュ作成キューが残っているかどうか |
| `pendingCaches` | number | キャッシュ作成待ちのトラック数（ダウンロード中 + キュー待ち） |

---

## GET /playlist

プレイリストを取得します。各トラックには UUID が付与されています。

### レスポンス

```json
{
  "shuffle": true,
  "tracks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "file",
      "path": "music/song.mp3",
      "title": "Song Title",
      "artist": "Artist Name"
    },
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "type": "url",
      "url": "https://example.com/track.mp3",
      "title": "Remote Track",
      "artist": "Remote Artist",
      "cached": true
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `shuffle` | boolean | シャッフル再生が有効かどうか |

### トラックオブジェクト

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | トラック UUID |
| `type` | `"file"` \| `"url"` | トラック種別 |
| `path` | string | ローカルファイルパス（`type: "file"` のみ） |
| `url` | string | リモート URL（`type: "url"` のみ） |
| `title` | string | 曲名 |
| `artist` | string | アーティスト名 |
| `cached` | boolean | キャッシュ済みかどうか（`type: "url"` のみ） |

---

## GET /cache

キャッシュディレクトリ内のファイル一覧と合計サイズを返します。

### レスポンス

```json
{
  "files": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "size": 5242880,
      "title": "Track Title",
      "artist": "Artist Name"
    }
  ],
  "totalSize": 52428800,
  "totalFiles": 10
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `files` | array | キャッシュファイル一覧 |
| `files[].id` | string | トラック UUID |
| `files[].size` | number | ファイルサイズ（バイト） |
| `files[].title` | string | 曲名（プレイリストに存在する場合） |
| `files[].artist` | string | アーティスト名（プレイリストに存在する場合） |
| `totalSize` | number | 合計サイズ（バイト） |
| `totalFiles` | number | ファイル数 |

---

## POST /cache/cleanup

キャッシュの整合性をチェックし、プレイリスト・スケジュールのどちらにも属さない孤立キャッシュファイルを削除します。

### リクエスト

ボディ不要。

### レスポンス

```json
{
  "ok": true,
  "tracks": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Track Title",
      "url": "https://example.com/track.mp3",
      "cached": true,
      "size": 5242880
    },
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "title": "Missing Track",
      "url": "https://example.com/missing.mp3",
      "cached": false,
      "size": null
    }
  ],
  "orphaned": [
    { "id": "old-orphan-id", "size": 1048576 }
  ],
  "deletedCount": 1,
  "freedBytes": 1048576
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `tracks` | array | 全 URL トラックのキャッシュ状態 |
| `tracks[].cached` | boolean | キャッシュファイルが存在するか |
| `tracks[].size` | number \| null | ファイルサイズ（未キャッシュ時は `null`） |
| `orphaned` | array | 削除された孤立キャッシュファイル |
| `deletedCount` | number | 削除されたファイル数 |
| `freedBytes` | number | 解放されたバイト数 |

---

## POST /skip

次の曲へスキップします。

### リクエスト

ボディ不要。

### レスポンス

```json
{
  "ok": true,
  "message": "Skipping to next track"
}
```

---

## POST /skip/:id

指定した UUID のトラックへジャンプします。

### パラメータ

| 名前 | 説明 |
|---|---|
| `id` | トラックの UUID |

### レスポンス（成功）

```json
{
  "ok": true,
  "message": "Skipping to track 550e8400-e29b-41d4-a716-446655440000"
}
```

### レスポンス（404）

```json
{
  "error": "Track not found: 550e8400-e29b-41d4-a716-446655440000"
}
```

---

## PUT /playlist

プレイリスト全体を置換します。`playlist.json` も更新されます。

### リクエスト

```json
{
  "shuffle": true,
  "tracks": [
    { "type": "file", "path": "music/song1.mp3" },
    { "type": "url", "url": "https://example.com/song2.mp3", "title": "Song 2", "artist": "Artist" }
  ]
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `shuffle` | いいえ | シャッフル再生の有効/無効（デフォルト: 現在値を維持） |
| `tracks` | はい | トラック配列 |

### レスポンス

```json
{
  "ok": true,
  "trackCount": 2,
  "caching": 1
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `trackCount` | number | プレイリストの総トラック数（キャッシュ済みのみ） |
| `caching` | number | バックグラウンドでキャッシュ作成中のトラック数 |

### エラー（400）

```json
{
  "error": "tracks must be an array"
}
```

---

## POST /playlist/tracks

トラックを 1 件追加します。UUID は自動付与され、レスポンスに含まれます。

### リクエスト（ローカルファイル）

```json
{
  "type": "file",
  "path": "music/new-song.mp3"
}
```

### リクエスト（リモート URL）

```json
{
  "type": "url",
  "url": "https://example.com/track.mp3",
  "title": "Track Title",
  "artist": "Artist Name"
}
```

### レスポンス

```json
{
  "ok": true,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "trackCount": 11,
  "caching": 1
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `ok` | boolean | 成功フラグ |
| `id` | string | 追加されたトラックの UUID |
| `trackCount` | number | 追加後の総トラック数（キャッシュ済みのみ） |
| `caching` | number | バックグラウンドでキャッシュ作成中のトラック数 |

### エラー（400）

```json
{
  "error": "Invalid track: type with path (file) or url (url) required"
}
```

---

## DELETE /playlist/tracks/:id

UUID を指定してトラックを削除します。

### パラメータ

| 名前 | 説明 |
|---|---|
| `id` | 削除するトラックの UUID |

### レスポンス

```json
{
  "ok": true,
  "trackCount": 9
}
```

### エラー（404）

```json
{
  "error": "Track not found: 550e8400-e29b-41d4-a716-446655440000"
}
```

---

## POST /interrupt

現在の曲を中断し、指定トラックを割り込み再生します。再生終了後はプレイリストに自動復帰します。

単一トラックまたは配列で複数トラックを指定できます。

### リクエスト（単一トラック）

```json
{
  "type": "url",
  "url": "https://example.com/jingle.mp3",
  "title": "Jingle",
  "artist": "Radio"
}
```

### リクエスト（複数トラック）

```json
[
  { "type": "url", "url": "https://example.com/jingle.mp3", "title": "Jingle" },
  { "type": "file", "path": "music/outro.mp3" }
]
```

トラック形式はプレイリストと同じ（`type: "file"` + `path`、または `type: "url"` + `url`）。

### レスポンス

```json
{
  "ok": true,
  "message": "Interrupt started"
}
```

### エラー（400）

```json
{
  "error": "Invalid track: type with path (file) or url (url) required"
}
```

---

## GET /schedule

スケジュール番組の一覧を取得します。

### レスポンス

```json
{
  "programs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "毎時ジングル",
      "cron": "0 * * * *",
      "tracks": [
        {
          "type": "url",
          "url": "https://example.com/jingle.mp3",
          "title": "Jingle",
          "artist": "Radio"
        }
      ],
      "enabled": true,
      "nextRun": "2026-02-15T10:00:00.000Z"
    }
  ]
}
```

### 番組オブジェクト

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | 番組 UUID |
| `name` | string | 番組名 |
| `cron` | string | cron 式（例: `"0 * * * *"` = 毎時0分） |
| `tracks` | array | 再生するトラック配列（プレイリストと同じ形式） |
| `enabled` | boolean | 有効/無効 |
| `nextRun` | string \| null | 次回実行時刻（ISO 8601、無効時は `null`） |

---

## POST /schedule/programs

スケジュール番組を追加します。UUID は自動付与されます。

**同じ cron 式の番組が既に存在する場合は上書き（upsert）されます。**

### リクエスト

```json
{
  "name": "毎時ジングル",
  "cron": "0 * * * *",
  "tracks": [
    {
      "type": "url",
      "url": "https://example.com/jingle.mp3",
      "title": "Jingle",
      "artist": "Radio"
    }
  ],
  "enabled": true
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `name` | はい | 番組名 |
| `cron` | はい | cron 式（同一 cron 式は上書き） |
| `tracks` | はい | トラック配列（`type` + `path` or `url`） |
| `enabled` | いいえ | デフォルト `true` |

### レスポンス

```json
{
  "ok": true,
  "program": { "id": "...", "name": "...", "cron": "...", "tracks": [...], "enabled": true },
  "caching": 3
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `program` | object | 追加/上書きされた番組 |
| `caching` | number | バックグラウンドでキャッシュ作成中のトラック数 |

### エラー（400）

```json
{
  "error": "Invalid cron expression: invalid"
}
```

---

## PUT /schedule/programs/:id

スケジュール番組を更新します。指定したフィールドのみ上書きされます。

### パラメータ

| 名前 | 説明 |
|---|---|
| `id` | 番組の UUID |

### リクエスト

```json
{
  "cron": "*/30 * * * *",
  "enabled": false
}
```

### レスポンス

```json
{
  "ok": true,
  "program": { "id": "...", "name": "...", "cron": "*/30 * * * *", "tracks": [...], "enabled": false },
  "caching": 3
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `program` | object | 更新された番組 |
| `caching` | number | バックグラウンドでキャッシュ作成中のトラック数 |

### エラー（404）

```json
{
  "error": "Program not found: 550e8400-e29b-41d4-a716-446655440000"
}
```

---

## DELETE /schedule/programs/:id

スケジュール番組を削除します。

### パラメータ

| 名前 | 説明 |
|---|---|
| `id` | 削除する番組の UUID |

### レスポンス

```json
{
  "ok": true
}
```

### エラー（404）

```json
{
  "error": "Program not found: 550e8400-e29b-41d4-a716-446655440000"
}
```

---

## GET /api-docs

この API リファレンス（API.md）を `text/plain` で返します。AI やプログラムから API 仕様を直接取得するためのエンドポイントです。

### レスポンスヘッダー

```
Content-Type: text/plain; charset=utf-8
```

### 使用例

```bash
curl http://localhost:3000/api-docs
```

ブラウザで閲覧する場合は `http://localhost:3000/?api` を使用してください。

---

## エラーレスポンス

### 401 Unauthorized

API キーが未指定または不正な場合:

```json
{
  "error": "Unauthorized"
}
```

### 共通フォーマット

エラーレスポンスは常に `error` フィールドを含みます:

```json
{
  "error": "エラーメッセージ"
}
```

---

## curl 例

```bash
# ステータス確認
curl http://localhost:3000/status

# プレイリスト取得
curl http://localhost:3000/playlist

# 次の曲へスキップ
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/skip

# 指定トラックへジャンプ
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/skip/550e8400-e29b-41d4-a716-446655440000

# トラック追加（ローカルファイル）
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"file","path":"music/song.mp3"}' \
  http://localhost:3000/playlist/tracks

# トラック追加（リモート URL）
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"url","url":"https://example.com/track.mp3","title":"Title","artist":"Artist"}' \
  http://localhost:3000/playlist/tracks

# トラック削除
curl -X DELETE -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/playlist/tracks/550e8400-e29b-41d4-a716-446655440000

# プレイリスト全置換
curl -X PUT -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tracks":[{"type":"file","path":"music/song1.mp3"},{"type":"file","path":"music/song2.mp3"}]}' \
  http://localhost:3000/playlist

# 割り込み再生
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"url","url":"https://example.com/jingle.mp3","title":"Jingle","artist":"Radio"}' \
  http://localhost:3000/interrupt

# キャッシュ状態
curl http://localhost:3000/cache

# キャッシュ整合性チェック＆クリーンアップ
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/cache/cleanup

# スケジュール一覧
curl http://localhost:3000/schedule

# スケジュール番組追加（同じ cron 式が既存の場合は上書き）
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"毎時ジングル","cron":"0 * * * *","tracks":[{"type":"url","url":"https://example.com/jingle.mp3","title":"Jingle"}]}' \
  http://localhost:3000/schedule/programs

# スケジュール番組更新
curl -X PUT -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}' \
  http://localhost:3000/schedule/programs/550e8400-e29b-41d4-a716-446655440000

# スケジュール番組削除
curl -X DELETE -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/schedule/programs/550e8400-e29b-41d4-a716-446655440000

# API リファレンス取得（テキスト）
curl http://localhost:3000/api-docs
```
