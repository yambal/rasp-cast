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

`http://localhost:3000/stream` をブラウザや VLC で開けば再生が始まります。

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
| GET | `/status` | 配信状態（バージョン、リスナー数、現在の曲） |
| GET | `/playlist` | プレイリスト取得（各トラックに UUID 付き） |

### 管理エンドポイント（`Authorization: Bearer <API_KEY>` 必須）

| メソッド | URL | 説明 |
|---|---|---|
| POST | `/skip` | 次の曲へスキップ |
| POST | `/skip/:id` | 指定 ID の曲へジャンプ |
| PUT | `/playlist` | プレイリスト全体を置換 |
| POST | `/playlist/tracks` | トラック追加（UUID 自動付与、レスポンスに `id` を返却） |
| DELETE | `/playlist/tracks/:id` | UUID 指定でトラック削除 |

### 認証設定

環境変数 `API_KEY` または `.env` ファイルで設定します。未設定時は全リクエスト許可（開発用）。

```bash
cp .env.example .env
# .env を編集して API_KEY を設定
```

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

### API キー設定

```bash
echo "API_KEY=your-secret-key" > /mnt/usbdata/rasp-cast/.env
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

systemd の `ExecStartPre` で起動前に `git pull && npm install` を実行します。Pi を再起動するだけで最新版に更新されます。

### 更新手順（手動）

```bash
cd /mnt/usbdata/rasp-cast
git pull
npm install
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
stream_data[]: "http://<IP>:<PORT>/stream|Rasp-Cast|Mixed|JP|128|0"
```

フォーマット: `URL|局名|ジャンル|言語|ビットレート|お気に入りフラグ`

ETS2 の制約:
- HTTP のみ（HTTPS 不可）
- MP3 フォーマットのみ（Ogg/Opus/AAC 不可）
- CBR 128kbps が安全
