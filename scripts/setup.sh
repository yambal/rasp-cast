#!/bin/bash
set -e

echo "=== Rasp-Cast Setup ==="
echo ""

# プロジェクトルート = git clone したディレクトリでそのまま動く
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MUSIC_DIR="$PROJECT_DIR/music"
SERVICE_USER="${SUDO_USER:-$(whoami)}"

# root チェック
if [ "$EUID" -ne 0 ]; then
  echo "sudo で実行してください: sudo bash scripts/setup.sh"
  exit 1
fi

# 1. Node.js インストール確認
echo "[1/4] Node.js 確認..."
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo "  Node.js $NODE_VER detected"
else
  echo "  Node.js not found. Installing..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  echo "  Node.js $(node -v) installed"
fi

# 2. npm install
echo "[2/4] Installing dependencies..."
cd "$PROJECT_DIR"
su "$SERVICE_USER" -c "cd $PROJECT_DIR && npm install"

# 3. systemd サービス登録
echo "[3/4] Installing systemd service..."
cat > /etc/systemd/system/rasp-cast.service <<EOF
[Unit]
Description=Rasp-Cast MP3 Streaming Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
ExecStartPre=-/bin/bash -c 'cd $PROJECT_DIR && git pull --ff-only && npm install --omit=dev'
ExecStart=$(which npx) tsx src/index.ts
Restart=on-failure
RestartSec=5
EnvironmentFile=-$PROJECT_DIR/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=MUSIC_DIR=$MUSIC_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable rasp-cast

# 4. ファイアウォール（ufw がある場合）
echo "[4/4] Firewall..."
if command -v ufw &>/dev/null; then
  ufw allow 3000/tcp 2>/dev/null || true
  echo "  Port 3000 allowed"
else
  echo "  ufw not found, skipping"
fi

# music ディレクトリ確保
mkdir -p "$MUSIC_DIR"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Music directory: $MUSIC_DIR"
echo "  Place .mp3 files there, then:"
echo ""
echo "  sudo systemctl start rasp-cast"
echo ""
IP=$(hostname -I | awk '{print $1}')
echo "Stream URL:  http://$IP:3000/stream"
echo "Status:      http://$IP:3000/status"
echo ""
echo "ETS2 live_streams.sii entry:"
echo "  stream_data[]: \"http://$IP:3000/stream|Rasp-Cast|Mixed|JP|128|0\""
echo ""
echo "Update: git pull && sudo bash scripts/setup.sh"
