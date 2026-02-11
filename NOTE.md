# Rasp-Cast 開発ノート

## 概要

Raspberry Pi で動作する Node.js 製 MP3 ストリーミングサーバー。
Euro Truck Simulator 2 (ETS2) のゲーム内ラジオで視聴可能。

## アーキテクチャ

```
[MP3ファイル] → [Node.js サーバー :3000] → HTTP audio/mpeg → [ETS2 / VLC / ブラウザ]
```

- Icecast / SHOUTcast / Liquidsoap 等の外部ツール不要
- Node.js 単体で ICY プロトコル互換のストリーミングを実装
- systemd でサービス管理

## ETS2 ラジオ互換性（調査結果）

### 必須条件
- **HTTP のみ**（HTTPS は非対応）
- **MP3 フォーマットのみ**（Ogg / Opus / AAC は不可）
- **CBR 128kbps** が安全（VBR は挙動不安定の可能性）

### SHOUTcast vs Icecast
- SHOUTcast DNAS v2 の ARM ビルドは入手困難（最終 ARM 版は 2013 年頃）
- Icecast2 は `apt install` で導入可能だが、そもそも不要
- **Node.js 単体で十分**（ICY ヘッダー付き HTTP ストリームを直接実装）

### ETS2 設定方法
`Documents\Euro Truck Simulator 2\live_streams.sii` に追加:
```
stream_data[]: "http://<IP>:3000/stream|Rasp-Cast|Mixed|JP|128|0"
```
フォーマット: `URL|局名|ジャンル|言語|ビットレート|お気に入りフラグ`

## ICY プロトコル

### レスポンスヘッダー
```
Content-Type: audio/mpeg
Transfer-Encoding: chunked
Connection: keep-alive
icy-metaint: 8192
icy-name: Rasp-Cast
icy-genre: Mixed
icy-br: 128
```

### メタデータ挿入
- クライアントがリクエストヘッダー `Icy-MetaData: 1` を送った場合のみ
- 8192 バイトのオーディオデータごとにメタデータブロックを挿入
- メタデータブロック: `[1バイト: 長さ/16] + [16バイト境界パディング済み文字列]`
- 例: `StreamTitle='Artist - Title';`
- メタデータなしの場合は `0x00` の 1 バイトのみ

## Raspberry Pi デプロイ

### 環境
- Raspberry Pi（Raspberry Pi OS）
- Node.js v20.x（ARM64）
- USB メモリにプロジェクト配置（SD カード摩耗防止）

### 初回セットアップ
```bash
cd /mnt/usbdata
sudo git clone https://github.com/yambal/rasp-cast.git
sudo chown -R yambal:yambal rasp-cast
cd rasp-cast
sudo bash scripts/setup.sh
sudo systemctl start rasp-cast
```

### setup.sh がやること
1. Node.js の存在確認（なければインストール）
2. `npm install`
3. systemd サービス登録 + 自動起動有効化
4. ファイアウォール開放（ufw がある場合）

### 更新手順
```bash
cd /mnt/usbdata/rasp-cast
git pull
npm install
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

### 確認用エンドポイント
| URL | 説明 |
|---|---|
| `http://<IP>:3000/stream` | MP3 ストリーム |
| `http://<IP>:3000/status` | JSON ステータス（リスナー数、現在の曲） |
| `POST http://<IP>:3000/skip` | 曲スキップ |

## ハマりポイント

### USB メモリの権限
- `/mnt/usbdata` が root 所有の場合、`sudo git clone` → `sudo chown` が必要
- 自動マウント未設定の場合、再起動後にサービスが起動失敗する
  → `/etc/fstab` に USB メモリのエントリを追加すること

### TypeScript の ReadStream 型
- `stream.on('data', callback)` の chunk 型が `Buffer | string`
- `Buffer.isBuffer(chunk)` で判定してから使う

## プロジェクト構成
```
rasp-cast/
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts              # Express 起動 + music/ スキャン
│   ├── stream/
│   │   ├── StreamManager.ts  # MP3 連続送信 + レート制御 + クライアント管理
│   │   └── IcyMetadata.ts    # ICY メタデータブロック生成・挿入
│   └── routes/
│       └── stream.routes.ts  # GET /stream, GET /status, POST /skip
├── scripts/
│   ├── setup.sh              # Raspberry Pi セットアップ
│   ├── start.sh              # systemctl start
│   └── stop.sh               # systemctl stop
├── music/                    # MP3 ファイル配置（test*.mp3 のみ git 管理）
│   └── test128.mp3           # テスト用音声
└── NOTE.md                   # このファイル
```

## 今後の予定（Step 3 以降）
- バックエンド API（プレイリスト CRUD、ライブラリ管理、設定変更）
- フロントエンド（React + Chakra UI 管理画面）
- ダッシュボード（Now Playing、リスナー数、スキップボタン）
- ファイルアップロード機能
- ETS2 設定スニペット自動生成
