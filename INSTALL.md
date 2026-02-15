# インストールガイド

## 必要環境

- Node.js v20 以上
- npm

## ローカル起動

```bash
git clone https://github.com/yambal/rasp-cast.git
cd rasp-cast
npm install
```

`music/` ディレクトリに MP3 ファイル（CBR 128kbps 推奨）を配置して起動:

```bash
npm run dev
```

- ストリーム: `http://localhost:3000/stream`（ブラウザや VLC で再生）
- ダッシュボード: `http://localhost:3000/`

## 環境変数

`.env` ファイルまたは環境変数で設定:

| 変数 | 説明 | デフォルト |
|---|---|---|
| `API_KEY` | 管理 API の認証トークン | 未設定（認証なし） |
| `PORT` | サーバーポート | `3000` |
| `MUSIC_DIR` | MP3 ファイルディレクトリ | `music` |
| `STATION_NAME` | 局名（ダッシュボード・ICY ヘッダー・ETS2 表示） | `YOUR STATION` |
| `PUBLIC_STREAM_URL` | 外部公開用ストリーム URL（ダッシュボードのプレイヤーに使用） | 空 |

`.env` の例:

```bash
API_KEY=your-secret-key
STATION_NAME=FM ETS2 JP
PUBLIC_STREAM_URL=http://your-server:8000/stream
```

## プレイリスト

`playlist.json` でローカルファイルとリモート URL を混在管理できます:

```json
{
  "tracks": [
    { "type": "file", "path": "music/song.mp3" },
    { "type": "url", "url": "https://example.com/track.mp3", "title": "Remote Track", "artist": "Artist" }
  ]
}
```

- `type: "file"` — ローカル MP3。`path` はプロジェクトルートからの相対パス。title/artist は ID3 タグから自動取得
- `type: "url"` — リモート MP3 URL。`title` / `artist` を JSON で指定
- `playlist.json` がなければ `music/` ディレクトリを自動スキャン

## API

### 公開エンドポイント（認証不要）

| メソッド | URL | 説明 |
|---|---|---|
| GET | `/stream` | MP3 ストリーム（ICY メタデータ対応） |
| GET | `/status` | 配信状態（バージョン、リスナー数、現在の曲、局名、ストリーム URL） |
| GET | `/playlist` | プレイリスト取得（各トラックに UUID 付き） |
| GET | `/schedule` | スケジュール番組一覧（次回実行時刻付き） |

### 管理エンドポイント（`Authorization: Bearer <API_KEY>` 必須）

| メソッド | URL | 説明 |
|---|---|---|
| POST | `/skip` | 次の曲へスキップ |
| POST | `/skip/:id` | 指定 ID の曲へジャンプ |
| PUT | `/playlist` | プレイリスト全体を置換 |
| POST | `/playlist/tracks` | トラック追加（UUID 自動付与、レスポンスに `id` を返却） |
| DELETE | `/playlist/tracks/:id` | UUID 指定でトラック削除 |
| POST | `/interrupt` | 割り込み再生（現在の曲を中断し、指定トラック再生後に復帰） |
| POST | `/schedule/programs` | スケジュール番組追加（同一 cron は上書き） |
| PUT | `/schedule/programs/:id` | スケジュール番組更新 |
| DELETE | `/schedule/programs/:id` | スケジュール番組削除 |

### 割り込み再生

現在の曲を中断し、指定トラックを再生後、プレイリストに復帰します:

```bash
curl -X POST http://localhost:3000/interrupt \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "file", "path": "music/jingle.mp3", "title": "Jingle"}'
```

### スケジュール番組

cron 式で指定した時刻にトラックを自動で割り込み再生します。タイムゾーンは Asia/Tokyo です。

```bash
# 毎時 0 分にジングルを再生（同じ cron 式の番組が既にあれば上書き）
curl -X POST http://localhost:3000/schedule/programs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "毎時ジングル",
    "cron": "0 * * * *",
    "tracks": [{ "type": "file", "path": "music/jingle.mp3", "title": "Jingle" }],
    "enabled": true
  }'
```

スケジュールは `schedule.json` に永続化されます。

## Raspberry Pi デプロイ

### 初回セットアップ

```bash
cd /mnt/usbdata
sudo git clone https://github.com/yambal/rasp-cast.git
sudo chown -R $(whoami):$(whoami) rasp-cast
cd rasp-cast
sudo bash scripts/setup.sh
```

`setup.sh` は以下を自動で行います:

1. Node.js の存在確認（なければインストール）
2. `npm install`
3. systemd サービス登録 + 自動起動有効化
4. ファイアウォール開放（ufw がある場合）

### 環境変数設定

```bash
cat > /mnt/usbdata/rasp-cast/.env <<EOF
API_KEY=your-secret-key
STATION_NAME=FM ETS2 JP
PUBLIC_STREAM_URL=http://your-server:8000/stream
EOF
sudo systemctl restart rasp-cast
```

### サービス管理

```bash
sudo systemctl start rasp-cast    # 起動
sudo systemctl stop rasp-cast     # 停止
sudo systemctl restart rasp-cast  # 再起動
sudo systemctl status rasp-cast   # 状態確認
journalctl -u rasp-cast -f        # ログ確認
```

### 自動更新

systemd の `ExecStartPre` で起動前に `git pull --ff-only && npm install --omit=dev` を実行します。Pi を再起動（またはサービス再起動）するだけで最新版に更新されます。

バックエンドの `dist/` はリポジトリにコミット済みのため、Pi 側で TypeScript のビルドは不要です。

### 更新手順（手動）

```bash
cd /mnt/usbdata/rasp-cast
git pull
sudo systemctl restart rasp-cast
```

## 外部公開（VPS リレー）

WireGuard VPN + nginx リバースプロキシで外部公開できます:

```
[クライアント] → HTTP :8000 → [VPS (nginx)] → WireGuard → [Raspberry Pi :3000]
```

nginx 設定のポイント:

- `proxy_buffering off` — ストリーミングにはバッファリング無効が必須
- `proxy_read_timeout 86400` — 長時間接続を維持
- ICY ヘッダーをそのまま転送

## ETS2 設定

`Documents\Euro Truck Simulator 2\live_streams.sii` に追加:

```
stream_data[]: "http://<IP>:<PORT>/stream|<局名>|Mixed|JP|128|0"
```

フォーマット: `URL|局名|ジャンル|言語|ビットレート|お気に入りフラグ`

ETS2 の制約:
- HTTP のみ（HTTPS 不可）
- MP3 フォーマットのみ（Ogg/Opus/AAC 不可）
- CBR 128kbps が安全
