# Rasp-Cast 開発ノート

## 概要

Raspberry Pi で動作する Node.js 製 MP3 ストリーミングサーバー。
Euro Truck Simulator 2 (ETS2) のゲーム内ラジオで視聴可能。

## アーキテクチャ

```
[MP3ファイル] → [Raspberry Pi :3000] → WireGuard → [Oracle VPS nginx :8000] → [ETS2 / VLC / ブラウザ]
```

- Icecast / SHOUTcast / Liquidsoap 等の外部ツール不要
- Node.js 単体で ICY プロトコル互換のストリーミングを実装
- systemd でサービス管理
- Oracle Cloud VPS (Free Tier) + WireGuard + nginx で外部公開

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
stream_data[]: "http://<VPS_IP>:8000/stream|Rasp-Cast|Mixed|JP|128|0"
```
フォーマット: `URL|局名|ジャンル|言語|ビットレート|お気に入りフラグ`

ローカル接続（LAN 内）:
```
stream_data[]: "http://<PI_IP>:3000/stream|Rasp-Cast|Mixed|JP|128|0"
```

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

### 自動更新（サービス起動時）
- systemd の `ExecStartPre` で起動前に `git pull --ff-only && npm install` を実行
- 先頭 `-` 付きなので、失敗しても（ネットワーク未接続等）サーバーは起動する
- 反映には `sudo bash scripts/setup.sh` の再実行が必要（サービス定義を更新）

### サービス管理
```bash
sudo systemctl start rasp-cast    # 起動
sudo systemctl stop rasp-cast     # 停止
sudo systemctl restart rasp-cast  # 再起動
sudo systemctl status rasp-cast   # 状態確認
journalctl -u rasp-cast -f        # ログ確認
```

### API エンドポイント

#### 公開（認証不要）
| メソッド | URL | 説明 |
|---|---|---|
| GET | `/stream` | MP3 ストリーム（ICY 対応） |
| GET | `/status` | JSON ステータス（バージョン、リスナー数、現在の曲） |
| GET | `/playlist` | プレイリスト取得（各トラックに UUID 付き） |

#### 管理（`Authorization: Bearer <API_KEY>` 必須）
| メソッド | URL | 説明 |
|---|---|---|
| POST | `/skip` | 次の曲へスキップ |
| POST | `/skip/:id` | 指定 ID の曲へジャンプ |
| PUT | `/playlist` | プレイリスト全体を置換 |
| POST | `/playlist/tracks` | トラック追加（UUID 自動付与） |
| DELETE | `/playlist/tracks/:id` | UUID 指定でトラック削除 |

#### 認証設定
- 環境変数 `API_KEY` で設定（`.env` ファイル対応）
- 未設定時は全リクエスト許可（開発用）
- Pi: `/mnt/usbdata/rasp-cast/.env` に保存

## 外部公開（Oracle Cloud VPS リレー）

### 構成
```
[クライアント] → HTTP :8000 → [Oracle VPS (nginx)] → WireGuard (10.0.100.0/24) → [Raspberry Pi :3000]
```

### VPS 情報
- Oracle Cloud Free Tier (AMD, Ubuntu 24.04)
- パブリック IP: `<VPS_IP>`
- WireGuard: `<WG_VPS_IP>` (VPS) ↔ `<WG_PI_IP>` (Pi)
- nginx: ポート 8000 → Pi `<WG_PI_IP>`:3000 にリバースプロキシ

### VPS 上のサービス
```bash
sudo systemctl status wg-quick@wg0    # WireGuard
sudo systemctl status nginx            # nginx
```

### VPS nginx 設定
`/etc/nginx/sites-available/rasp-cast`
- `GET /stream` → Pi の `/stream` にプロキシ（バッファリング無効、タイムアウト24h）
- `GET /status` → Pi の `/status` にプロキシ

### Pi 側 WireGuard 設定
`/etc/wireguard/wg0.conf`
- Address: `<WG_PI_IP>`/24
- Endpoint: `<VPS_IP>`:51820
- PersistentKeepalive: 25（NAT 越え維持）

### Oracle Cloud VCN 注意点
- セキュリティリストで TCP 8000 と UDP 51820 のイングレスルールが必要
- IGW にルート表を関連付けると「イングレス用」扱いになり、0.0.0.0/0 → IGW ルールが追加不可
  → 空のルート表を IGW に関連付け、Default Route Table に 0.0.0.0/0 → IGW を設定
- iptables でも同ポートを開放（`netfilter-persistent save` で永続化）

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
├── .env.example              # 環境変数サンプル（API_KEY）
├── playlist.json             # プレイリスト定義（UUID 付き）
├── src/
│   ├── index.ts              # Express 起動 + プレイリスト読み込み
│   ├── stream/
│   │   ├── StreamManager.ts  # MP3 連続送信 + レート制御 + プレイリスト管理
│   │   └── IcyMetadata.ts    # ICY メタデータブロック生成・挿入
│   ├── routes/
│   │   ├── stream.routes.ts  # GET /stream, GET /status, POST /skip
│   │   └── playlist.routes.ts # プレイリスト CRUD API
│   └── middleware/
│       └── auth.ts           # API キー認証ミドルウェア
├── scripts/
│   ├── setup.sh              # Raspberry Pi セットアップ
│   ├── start.sh              # systemctl start
│   └── stop.sh               # systemctl stop
├── music/                    # MP3 ファイル配置（test*.mp3 のみ git 管理）
│   └── test128.mp3           # テスト用音声
└── NOTE.md                   # このファイル
```

## 進捗

### Step 1: プロジェクト初期化 — 完了
- [x] package.json / tsconfig.json / .gitignore
- [x] GitHub リポジトリ作成 (yambal/rasp-cast)

### Step 2: ストリーミング PoC — 完了
- [x] StreamManager（MP3 連続再生 + レート制御 + クライアント管理）
- [x] IcyMetadata（ICY メタデータブロック生成・挿入）
- [x] Express ルーティング（/stream, /status, /skip）
- [x] ローカル再生確認（ブラウザ / VLC）
- [x] Raspberry Pi デプロイ（systemd サービス化）
- [x] ETS2 ゲーム内ラジオ再生確認（LAN 経由）
- [x] Oracle Cloud VPS + WireGuard + nginx で外部公開
- [x] ETS2 再生確認（外部公開 URL 経由）
- [x] Pi 再起動後の自動復旧確認

### Step 3: バックエンド API — 進行中
- [x] プレイリスト CRUD API（取得・全置換・追加・削除）
- [x] UUID によるトラック識別（追加時自動付与、playlist.json に永続化）
- [x] API キー認証（Bearer token、管理系エンドポイントのみ）
- [x] .env ファイル対応（systemd EnvironmentFile）
- [x] URL ベーストラック対応（ローカルファイルと共存）
- [ ] ライブラリ管理 API（music/ 内のファイル一覧・メタデータ取得）
- [ ] 設定変更 API（ビットレート・ポート等）
- [ ] ファイルアップロード API（MP3 アップロード → music/ に保存）

### Step 4: フロントエンド（React + Chakra UI） — 未着手
- [ ] Vite + React + TypeScript + Chakra UI セットアップ
- [ ] ダッシュボード（Now Playing、リスナー数、スキップボタン）
- [ ] プレイリスト管理画面
- [ ] ライブラリ管理画面（ファイル一覧・アップロード）
- [ ] ETS2 設定スニペット自動生成

### Step 5: 本番運用 — 一部着手
- [ ] フロントエンドを VPS 経由で HTTPS 配信（Cloudflare Tunnel or Let's Encrypt）
- [x] API キー認証（管理系エンドポイント保護済み）
- [ ] ログ・監視（n8n ヘルスチェック連携）
