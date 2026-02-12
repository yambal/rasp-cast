# Rasp-Cast

Raspberry Pi を使った、自分だけのインターネットラジオ局。

自分の MP3 コレクションを、ブラウザや VLC、ゲーム内ラジオなど **あらゆる MP3 ストリーム対応プレイヤーで聴けるようにする**。それが Rasp-Cast のコンセプトです。

SHOUTcast や Icecast のようなストリーミングサーバーを立てたいけど、セットアップが複雑だったり ARM ビルドが手に入らなかったり。Rasp-Cast は **Node.js 単体** で SHOUTcast/Icecast 互換の MP3 ストリーミングを実現します。外部ツール不要、`npm install` して起動するだけです。

## 特徴

- **手軽**: Node.js だけで動作。SHOUTcast / Icecast / Liquidsoap 等の外部ツール不要
- **互換性**: ICY メタデータプロトコル対応。VLC、ブラウザ、ゲーム内ラジオなど幅広いクライアントで再生可能
- **REST API**: プレイリスト管理・スキップ操作を HTTP API で制御
- **柔軟なソース**: ローカル MP3 ファイルとリモート URL を混在再生
- **省リソース**: Raspberry Pi でも安定動作。systemd によるサービス化対応

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

Raspberry Pi デプロイ、API リファレンス、外部公開の手順は **[INSTALL.md](INSTALL.md)** を参照してください。

## 活用例: Euro Truck Simulator 2

ETS2 のゲーム内ラジオは SHOUTcast/Icecast 互換のストリームを受信できます。Rasp-Cast はこのプロトコルに対応しているため、自分の音楽をゲーム内ラジオとして聴くことができます。

`Documents\Euro Truck Simulator 2\live_streams.sii` に追加:

```
stream_data[]: "http://<IP>:3000/stream|Rasp-Cast|Mixed|JP|128|0"
```

## 技術スタック

- **Runtime**: Node.js + TypeScript (ESM)
- **Server**: Express
- **Streaming**: 自前実装（ICY メタデータ、レート制御）
- **Data**: JSON ファイル（DB 不要）
- **Deploy**: systemd + WireGuard + nginx

## ライセンス

MIT
