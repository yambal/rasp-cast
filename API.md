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
| POST | `/skip` | 必要 | 次の曲へスキップ |
| POST | `/skip/:id` | 必要 | 指定トラックへジャンプ |
| PUT | `/playlist` | 必要 | プレイリスト全置換 |
| POST | `/playlist/tracks` | 必要 | トラック追加 |
| DELETE | `/playlist/tracks/:id` | 必要 | トラック削除 |

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
  "version": "0.1.3",
  "isStreaming": true,
  "listeners": 2,
  "currentTrack": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Song Title",
    "artist": "Artist Name",
    "filename": "song.mp3"
  },
  "totalTracks": 10,
  "currentIndex": 3
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `version` | string | サーバーバージョン |
| `isStreaming` | boolean | 配信中かどうか |
| `listeners` | number | 接続中のリスナー数 |
| `currentTrack` | object \| null | 現在再生中のトラック |
| `totalTracks` | number | プレイリストの総トラック数 |
| `currentIndex` | number | 現在の再生位置（0始まり） |

---

## GET /playlist

プレイリストを取得します。各トラックには UUID が付与されています。

### レスポンス

```json
{
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
      "artist": "Remote Artist"
    }
  ]
}
```

### トラックオブジェクト

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | トラック UUID |
| `type` | `"file"` \| `"url"` | トラック種別 |
| `path` | string | ローカルファイルパス（`type: "file"` のみ） |
| `url` | string | リモート URL（`type: "url"` のみ） |
| `title` | string | 曲名 |
| `artist` | string | アーティスト名 |

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
  "tracks": [
    { "type": "file", "path": "music/song1.mp3" },
    { "type": "url", "url": "https://example.com/song2.mp3", "title": "Song 2", "artist": "Artist" }
  ]
}
```

### レスポンス

```json
{
  "ok": true,
  "trackCount": 2
}
```

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
  "trackCount": 11
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `ok` | boolean | 成功フラグ |
| `id` | string | 追加されたトラックの UUID |
| `trackCount` | number | 追加後の総トラック数 |

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
```
