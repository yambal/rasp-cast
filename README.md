# Rasp-Cast

Raspberry Pi を使った、自分だけのインターネットラジオ局。

自分の MP3 コレクションを、ブラウザや VLC、ゲーム内ラジオなど **あらゆる MP3 ストリーム対応プレイヤーで聴けるようにする**。それが Rasp-Cast のコンセプトです。

SHOUTcast や Icecast のようなストリーミングサーバーを立てたいけど、セットアップが複雑だったり ARM ビルドが手に入らなかったり。Rasp-Cast は **Node.js 単体** で SHOUTcast/Icecast 互換の MP3 ストリーミングを実現します。外部ツール不要、`npm install` して起動するだけです。

## 特徴

- **手軽**: Node.js だけで動作。SHOUTcast / Icecast / Liquidsoap 等の外部ツール不要
- **互換性**: ICY メタデータプロトコル対応。VLC、ブラウザ、ゲーム内ラジオなど幅広いクライアントで再生可能
- **Web ダッシュボード**: ブラウザから再生状況・スケジュールを確認、その場で視聴可能
- **スケジュール再生**: cron 式で指定した時刻にトラックを割り込み再生（時報・ジングル等）
- **REST API**: プレイリスト管理・スキップ・割り込み再生・スケジュール管理を HTTP API で制御
- **柔軟なソース**: ローカル MP3 ファイルとリモート URL を混在再生
- **省リソース**: Raspberry Pi でも安定動作（CPU ~1%、メモリ ~83MB）
- **自動更新**: systemd 起動時に `git pull` で最新版に自動更新

## 仕組み

```
[MP3ファイル / URL] → [Rasp-Cast :3000] → [VLC / ブラウザ / ゲーム内ラジオ / etc.]
```

VPN + リバースプロキシで外部公開すれば、どこからでも聴けるインターネットラジオに:

```
[Rasp-Cast :3000] → WireGuard → [VPS nginx :8000] → [世界中のリスナー]
```

## クイックスタート

```bash
git clone https://github.com/yambal/rasp-cast.git
cd rasp-cast
npm install
npm run dev
```

`music/` に MP3 ファイルを置いて、ブラウザや VLC で `http://localhost:3000/stream` を開けば再生が始まります。

ダッシュボードは `http://localhost:3000/` でアクセスできます。

Raspberry Pi デプロイ、API リファレンス、外部公開の手順は **[INSTALL.md](INSTALL.md)** を参照してください。

## Web ダッシュボード

ブラウザからアクセスできるダッシュボードで、以下を確認・操作できます:

- 配信状態（LIVE / OFFLINE / INTERRUPT）とリスナー数
- 再生中のトラック名・アーティスト
- ブラウザ内プレイヤーでその場で視聴
- スケジュール番組の一覧と次回実行時刻
- ETS2 ラジオ設定スニペット

### フロントエンド開発

```bash
npm run dev            # バックエンド起動 (:3000)
npm run dev:frontend   # Vite dev server (:5173、:3000 にプロキシ)
```

本番ビルド:

```bash
npm run build:frontend   # frontend/dist/ に出力
```

ビルド済みフロントエンドは Express が `frontend/dist/` から自動配信します。

## 環境変数

`.env` ファイルまたは環境変数で設定:

| 変数 | 説明 | デフォルト |
|---|---|---|
| `API_KEY` | 管理 API の認証トークン | 未設定（認証なし） |
| `PORT` | サーバーポート | `3000` |
| `MUSIC_DIR` | MP3 ファイルディレクトリ | `music` |
| `STATION_NAME` | 局名（ダッシュボード・ICY ヘッダーに表示） | `YOUR STATION` |
| `PUBLIC_STREAM_URL` | 外部公開用ストリーム URL（ダッシュボードのプレイヤーに使用） | 空 |

`.env` の例:

```bash
API_KEY=your-secret-key
STATION_NAME=FM ETS2 JP
PUBLIC_STREAM_URL=http://your-server:8000/stream
```

## 活用例: Euro Truck Simulator 2

ETS2 のゲーム内ラジオは SHOUTcast/Icecast 互換のストリームを受信できます。Rasp-Cast はこのプロトコルに対応しているため、自分の音楽をゲーム内ラジオとして聴くことができます。

`Documents\Euro Truck Simulator 2\live_streams.sii` に追加:

```
stream_data[]: "http://<IP>:<PORT>/stream|<局名>|Mixed|JP|128|0"
```

フォーマット: `URL|局名|ジャンル|言語|ビットレート|お気に入りフラグ`

ETS2 の制約:
- HTTP のみ（HTTPS 不可）
- MP3 フォーマットのみ（Ogg/Opus/AAC 不可）
- CBR 128kbps が安全

## 技術スタック

- **Backend**: Node.js + Express + TypeScript (ESM)
- **Frontend**: React + Vite + Chakra UI v3
- **Streaming**: 自前実装（ICY メタデータ、レート制御 128kbps、ETS2/FMOD 互換メタデータサニタイズ）
- **Schedule**: node-cron（Asia/Tokyo タイムゾーン）
- **Data**: JSON ファイル（DB 不要）
- **Deploy**: systemd + WireGuard + nginx

## ライセンス

MIT
