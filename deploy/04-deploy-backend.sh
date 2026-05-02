#!/usr/bin/env bash
# =============================================================================
# 04-deploy-backend.sh — Build Docker image locally and deploy to EC2
#
# Prerequisites:
#   - deploy/infra-outputs.txt exists (from 01-aws-infra.sh)
#   - deploy/.env.production.template has real endpoints (from 03-check-endpoints.sh)
#   - EC2 is running and SSH accessible
#
# Usage:
#   chmod +x deploy/04-deploy-backend.sh
#   ./deploy/04-deploy-backend.sh
#
# On subsequent deploys (code changes), just run this script again.
# =============================================================================

set -euo pipefail

REGION="ap-south-1"
KEY="~/.ssh/tasksync-key.pem"
APP_NAME="tasksync"

# ── Get EC2 IP from infra outputs ─────────────────────────────────────────────
if [ ! -f deploy/infra-outputs.txt ]; then
  echo "ERROR: deploy/infra-outputs.txt not found. Run 01-aws-infra.sh first."
  exit 1
fi

EC2_IP=$(grep "EC2 Public IP:" deploy/infra-outputs.txt | awk '{print $NF}')
echo "Deploying to EC2: $EC2_IP"

# ── Check .env.production.template has no placeholders ───────────────────────
if grep -q "FILL_" deploy/.env.production.template 2>/dev/null; then
  echo "ERROR: deploy/.env.production.template still has FILL_ placeholders."
  echo "Run ./deploy/03-check-endpoints.sh first to populate real endpoints."
  exit 1
fi

ENV_FILE="deploy/.env.production.template"

# ── Wait for EC2 SSH to be ready ──────────────────────────────────────────────
echo "Waiting for EC2 SSH..."
for i in $(seq 1 20); do
  ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
    ubuntu@"$EC2_IP" "echo ok" 2>/dev/null && break
  echo "  Attempt $i/20 failed, retrying in 15s..."
  sleep 15
done

# ── Copy app source to EC2 ────────────────────────────────────────────────────
echo "Syncing source code to EC2..."
rsync -az --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'frontend' \
  --exclude 'deploy' \
  --exclude '.env' \
  -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
  ./backend/ ubuntu@"$EC2_IP":/opt/tasksync/backend/

# Copy .env.production as .env on the server
scp -i "$KEY" -o StrictHostKeyChecking=no \
  "$ENV_FILE" ubuntu@"$EC2_IP":/opt/tasksync/backend/.env

# Copy the DocumentDB TLS cert path reference (cert is already on server from userdata)
# Copy Dockerfile
scp -i "$KEY" -o StrictHostKeyChecking=no \
  ./backend/Dockerfile ubuntu@"$EC2_IP":/opt/tasksync/backend/Dockerfile

# ── Build and run Docker container on EC2 ─────────────────────────────────────
echo "Building and starting Docker container on EC2..."
ssh -i "$KEY" -o StrictHostKeyChecking=no ubuntu@"$EC2_IP" << 'REMOTE'
set -e
cd /opt/tasksync/backend

echo "Building production Docker image..."
docker build --target production -t tasksync-backend:latest .

echo "Stopping old container (if any)..."
docker stop tasksync-backend 2>/dev/null || true
docker rm tasksync-backend 2>/dev/null || true

echo "Starting new container..."
docker run -d \
  --name tasksync-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  -v /etc/ssl/certs/global-bundle.pem:/etc/ssl/certs/global-bundle.pem:ro \
  tasksync-backend:latest

echo "Container started. Checking health..."
sleep 5
docker ps | grep tasksync-backend
docker logs tasksync-backend --tail 20
REMOTE

echo ""
echo "=========================================="
echo " Backend deployed!"
echo " API: http://$EC2_IP/api/v1"
echo " Health check:"
echo "   curl http://$EC2_IP/api/v1/health"
echo "=========================================="
