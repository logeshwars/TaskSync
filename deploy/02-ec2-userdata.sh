#!/usr/bin/env bash
# =============================================================================
# 02-ec2-userdata.sh — EC2 bootstrap script (runs once on first boot as root)
#
# Installs: Docker, Nginx, downloads DocumentDB TLS cert
# This file is passed as --user-data to `aws ec2 run-instances`
# =============================================================================

set -euo pipefail
exec > /var/log/userdata.log 2>&1

echo "[userdata] Starting setup at $(date)"

# ── System updates ────────────────────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y

# ── Docker ────────────────────────────────────────────────────────────────────
apt-get install -y ca-certificates curl gnupg lsb-release nginx

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu

# ── DocumentDB TLS Certificate ────────────────────────────────────────────────
# Required for connecting to DocumentDB with TLS enabled
curl -o /etc/ssl/certs/global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

# ── Nginx config (reverse proxy → Docker container on :3000) ─────────────────
cat > /etc/nginx/sites-available/tasksync << 'NGINX'
server {
    listen 80;
    server_name _;

    # Increase timeouts for Socket.IO long-polling
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket / Socket.IO upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/tasksync /etc/nginx/sites-enabled/tasksync
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

# ── App directory ─────────────────────────────────────────────────────────────
mkdir -p /opt/tasksync
chown ubuntu:ubuntu /opt/tasksync

echo "[userdata] Setup complete at $(date)"
