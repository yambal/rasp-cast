# Rasp-Cast サービス管理ガイド

Raspberry Pi 上での rasp-cast サービスの運用・管理方法を解説します。

## 目次

1. [サービスの基本操作](#サービスの基本操作)
2. [ログ確認とデバッグ](#ログ確認とデバッグ)
3. [更新とデプロイ](#更新とデプロイ)
4. [トラブルシューティング](#トラブルシューティング)
5. [サービス定義の詳細](#サービス定義の詳細)

---

## サービスの基本操作

### サービスの状態確認

```bash
systemctl status rasp-cast
```

**出力例:**
```
● rasp-cast.service - Rasp-Cast MP3 Streaming Server
     Loaded: loaded (/etc/systemd/system/rasp-cast.service; enabled; preset: enabled)
     Active: active (running) since Mon 2026-02-16 22:08:21 JST; 10min ago
   Main PID: 1088 (node)
      Tasks: 11 (limit: 756)
```

- **Loaded**: サービスが systemd に登録されているか
- **Active**: 現在の実行状態（`running` = 稼働中）
- **enabled**: 自動起動が有効

### サービスの起動・停止・再起動

```bash
# 起動
sudo systemctl start rasp-cast

# 停止
sudo systemctl stop rasp-cast

# 再起動
sudo systemctl restart rasp-cast

# 設定リロード後の再起動
sudo systemctl daemon-reload
sudo systemctl restart rasp-cast
```

### 自動起動の設定

```bash
# 自動起動を有効化
sudo systemctl enable rasp-cast

# 自動起動を無効化
sudo systemctl disable rasp-cast

# 自動起動の状態確認
systemctl is-enabled rasp-cast
```

---

## ログ確認とデバッグ

### 基本的なログ確認

```bash
# 直近50行のログを表示
journalctl -u rasp-cast -n 50 --no-pager

# リアルタイムでログを追跡
journalctl -u rasp-cast -f

# 直近1時間のログ
journalctl -u rasp-cast --since "1 hour ago"

# 特定の日時以降のログ
journalctl -u rasp-cast --since "2026-02-16 22:00:00"
```

### ログの検索

```bash
# エラーのみ抽出
journalctl -u rasp-cast | grep -i error

# 特定の文字列を検索
journalctl -u rasp-cast | grep "Now playing"

# タイムアウトエラーを検索
journalctl -u rasp-cast | grep "timeout"
```

### よく確認するログ

**正常な起動:**
```
[rasp-cast] Server running on http://localhost:3000
[rasp-cast] Stream URL: http://localhost:3000/stream
[rasp-cast] 15 tracks loaded
[StreamManager] Streaming started
```

**クライアント接続:**
```
[StreamManager] Client connected (metadata=true). Total: 2
[StreamManager] Client disconnected. Total: 1
```

**トラック再生:**
```
[StreamManager] Now playing: Artist - Title
```

**エラー例:**
```
[StreamManager] Error streaming https://example.com/track.mp3: The operation was aborted due to timeout
[StreamManager] HTTP 404 fetching https://example.com/missing.mp3
```

---

## 更新とデプロイ

### 自動更新の仕組み

rasp-cast サービスは起動時に自動的に Git から最新コードを取得します：

```bash
# サービス起動時に実行される
cd /mnt/usbdata/rasp-cast
git pull --ff-only
npm install --omit=dev
```

**注意**: TypeScript のビルド（`npm run build`）は自動では実行されないため、手動更新が推奨されます。

### 手動更新（推奨）

```bash
# 1. プロジェクトディレクトリに移動
cd /mnt/usbdata/rasp-cast

# 2. Git 状態を確認
git status

# 3. ローカル変更がある場合は退避
git stash

# 4. 最新コードを取得
git pull --ff-only

# 5. 依存パッケージを更新
npm install

# 6. TypeScript をビルド
npm run build

# 7. サービスを再起動
sudo systemctl restart rasp-cast

# 8. ログで起動を確認
journalctl -u rasp-cast -n 20 --no-pager
```

### クイック更新

```bash
cd /mnt/usbdata/rasp-cast && \
git stash && \
git pull --ff-only && \
npm install && \
npm run build && \
sudo systemctl restart rasp-cast
```

### バージョン確認

```bash
# 現在のコミット
cd /mnt/usbdata/rasp-cast
git log --oneline -1

# package.json のバージョン
cat package.json | grep version

# API でバージョン確認
curl http://localhost:3000/status | jq .version
```

---

## トラブルシューティング

### 問題 1: git pull が失敗する

**症状:**
```
error: Your local changes to the following files would be overwritten by merge:
        package-lock.json
Please commit your changes or stash them before you merge.
Aborting
```

**原因:**
`package-lock.json` にローカル変更があり、マージできない

**解決方法 A（変更を退避）:**
```bash
cd /mnt/usbdata/rasp-cast
git stash
git pull --ff-only
npm install
npm run build
sudo systemctl restart rasp-cast
```

**解決方法 B（変更を破棄）:**
```bash
cd /mnt/usbdata/rasp-cast
git checkout -- package-lock.json
git pull --ff-only
npm install
npm run build
sudo systemctl restart rasp-cast
```

### 問題 2: 再起動しても古いコードで起動する

**症状:**
`systemctl restart` しても最新のコードが反映されない

**原因:**
- `git pull` が失敗している（ローカル変更がある）
- `npm run build` が実行されず、`dist/` が古いまま

**解決方法:**
```bash
# 1. サービス停止
sudo systemctl stop rasp-cast

# 2. 手動で更新
cd /mnt/usbdata/rasp-cast
git stash
git pull --ff-only
npm install
npm run build

# 3. サービス起動
sudo systemctl start rasp-cast

# 4. 確認
journalctl -u rasp-cast -n 20 --no-pager
```

### 問題 3: サービスが起動しない

**症状:**
```
● rasp-cast.service - Rasp-Cast MP3 Streaming Server
     Loaded: loaded
     Active: failed (Result: exit-code)
```

**原因の調査:**
```bash
# 詳細なログを確認
journalctl -u rasp-cast -n 100 --no-pager

# エラーメッセージを抽出
journalctl -u rasp-cast | grep -i error | tail -20
```

**よくある原因:**
1. **Node.js がインストールされていない**
   ```bash
   node --version
   # v20.x.x が表示されるはず
   ```

2. **ポート 3000 が既に使用中**
   ```bash
   sudo lsof -i :3000
   # 何か表示されたら、そのプロセスを停止
   ```

3. **ディレクトリが存在しない**
   ```bash
   ls -la /mnt/usbdata/rasp-cast
   # ディレクトリが存在するか確認
   ```

4. **権限の問題**
   ```bash
   # yambal ユーザーに所有権があるか確認
   ls -la /mnt/usbdata/ | grep rasp-cast
   # 所有者が root の場合は変更
   sudo chown -R yambal:yambal /mnt/usbdata/rasp-cast
   ```

### 問題 4: URL トラックが 10 秒でタイムアウトする

**症状:**
```
[StreamManager] Error streaming https://example.com/track.mp3: The operation was aborted due to timeout
```

**原因:**
- ネットワークが遅い
- URL が無効または到達不可能
- サーバー側の応答が遅い

**解決方法:**
```bash
# URL が取得可能か手動で確認
curl -I https://example.com/track.mp3

# ネットワーク速度を確認
ping -c 5 example.com

# DNS 解決を確認
nslookup example.com
```

**対策:**
- v0.2.3 以降は、キューベースのレート制御により改善されています
- 10 秒タイムアウトはコード内で固定されています（変更は非推奨）
- URL トラックをローカルファイルに置き換えることを検討

### 問題 5: USB メモリがマウントされていない

**症状:**
```
bash: cd: /mnt/usbdata/rasp-cast: No such file or directory
```

**原因:**
USB メモリが自動マウントされていない

**解決方法:**
```bash
# USB デバイスを確認
lsblk

# 手動マウント
sudo mount /dev/sda1 /mnt/usbdata

# 自動マウント設定（/etc/fstab に追加）
sudo nano /etc/fstab
# 以下を追加:
# /dev/sda1 /mnt/usbdata ext4 defaults 0 2
```

---

## サービス定義の詳細

### サービスファイルの場所

```bash
/etc/systemd/system/rasp-cast.service
```

### サービスファイルの内容

```bash
# サービスファイルを表示
cat /etc/systemd/system/rasp-cast.service

# サービスファイルを編集
sudo nano /etc/systemd/system/rasp-cast.service

# 編集後は必ず reload
sudo systemctl daemon-reload
sudo systemctl restart rasp-cast
```

### 現在のサービス定義

```ini
[Unit]
Description=Rasp-Cast MP3 Streaming Server
After=network.target

[Service]
Type=simple
User=yambal
WorkingDirectory=/mnt/usbdata/rasp-cast
ExecStartPre=-/bin/bash -c 'cd /mnt/usbdata/rasp-cast && git pull --ff-only && npm install --omit=dev'
ExecStart=/usr/bin/node /mnt/usbdata/rasp-cast/dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=-/mnt/usbdata/rasp-cast/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=MUSIC_DIR=/mnt/usbdata/rasp-cast/music

[Install]
WantedBy=multi-user.target
```

### 各項目の説明

| 項目 | 説明 |
|---|---|
| `After=network.target` | ネットワークが起動してからサービスを開始 |
| `User=yambal` | yambal ユーザーでプロセスを実行 |
| `WorkingDirectory` | 作業ディレクトリ |
| `ExecStartPre=-` | 起動前に実行（`-` は失敗を無視） |
| `ExecStart` | メインプロセス |
| `Restart=on-failure` | 異常終了時に自動再起動 |
| `RestartSec=5` | 再起動までの待機時間（5秒） |
| `EnvironmentFile=-` | `.env` ファイルを読み込む（`-` は存在しなくても無視） |

### 改善案: ビルドを含める

現在の `ExecStartPre` には `npm run build` が含まれていません。確実に最新コードで起動するには、以下のように変更します：

```ini
ExecStartPre=-/bin/bash -c 'cd /mnt/usbdata/rasp-cast && git checkout -- . && git pull --ff-only && npm install --omit=dev && npm run build'
```

**変更点:**
- `git checkout -- .` でローカル変更をリセット
- `npm run build` で TypeScript をビルド

**変更手順:**
```bash
sudo nano /etc/systemd/system/rasp-cast.service
# ExecStartPre の行を上記に変更

sudo systemctl daemon-reload
sudo systemctl restart rasp-cast
```

---

## 便利なコマンド集

### ワンライナー

```bash
# サービス再起動 + ログ確認
sudo systemctl restart rasp-cast && journalctl -u rasp-cast -f

# 状態 + 最新ログ
systemctl status rasp-cast && journalctl -u rasp-cast -n 20 --no-pager

# Git 更新 + ビルド + 再起動
cd /mnt/usbdata/rasp-cast && git stash && git pull && npm install && npm run build && sudo systemctl restart rasp-cast

# バージョン確認
cd /mnt/usbdata/rasp-cast && git log --oneline -1 && cat package.json | grep version

# 現在のリスナー数確認
curl -s http://localhost:3000/status | jq '.listeners'
```

### エイリアス設定

`.bashrc` に追加すると便利：

```bash
# ~/.bashrc に追加
alias rcast-status='systemctl status rasp-cast'
alias rcast-restart='sudo systemctl restart rasp-cast'
alias rcast-log='journalctl -u rasp-cast -f'
alias rcast-update='cd /mnt/usbdata/rasp-cast && git stash && git pull && npm install && npm run build && sudo systemctl restart rasp-cast'

# 反映
source ~/.bashrc
```

使用例：
```bash
rcast-status
rcast-restart
rcast-log
rcast-update
```

---

## 関連ドキュメント

- [README.md](README.md) - プロジェクト概要
- [INSTALL.md](INSTALL.md) - 初回インストール手順
- [API.md](API.md) - API リファレンス
- [NOTE.md](NOTE.md) - 技術的な開発ノート
