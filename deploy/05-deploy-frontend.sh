#!/usr/bin/env bash
# =============================================================================
# 05-deploy-frontend.sh — Build React app and upload to S3
#
# Prerequisites:
#   - deploy/infra-outputs.txt exists (from 01-aws-infra.sh)
#   - Backend is running and you know the EC2 public DNS
#
# Usage:
#   chmod +x deploy/05-deploy-frontend.sh
#   ./deploy/05-deploy-frontend.sh
# =============================================================================

set -euo pipefail

REGION="ap-south-1"

# ── Get S3 bucket + EC2 DNS from infra outputs ────────────────────────────────
if [ ! -f deploy/infra-outputs.txt ]; then
  echo "ERROR: deploy/infra-outputs.txt not found. Run 01-aws-infra.sh first."
  exit 1
fi

BUCKET_NAME=$(grep "S3 Bucket:" deploy/infra-outputs.txt | awk '{print $NF}')
EC2_DNS=$(grep "EC2 Public DNS:" deploy/infra-outputs.txt | awk '{print $NF}')

echo "S3 Bucket: $BUCKET_NAME"
echo "Backend:   http://$EC2_DNS"

# ── Write frontend .env for production build ──────────────────────────────────
echo "Writing frontend/.env.production..."
cat > frontend/.env.production << EOF
VITE_API_URL=http://${EC2_DNS}/api/v1
VITE_SOCKET_URL=http://${EC2_DNS}
EOF

echo "Frontend will connect to: http://$EC2_DNS"

# ── Build frontend ────────────────────────────────────────────────────────────
echo "Installing frontend dependencies..."
npm install --prefix frontend

echo "Building frontend..."
npm --prefix frontend run build

# ── Upload to S3 ──────────────────────────────────────────────────────────────
echo "Uploading to S3..."

# Upload assets with long cache (hashed filenames — safe to cache 1 year)
aws s3 sync frontend/dist/ "s3://$BUCKET_NAME/" \
  --region "$REGION" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"

# Upload index.html with NO cache (always fresh)
aws s3 cp frontend/dist/index.html "s3://$BUCKET_NAME/index.html" \
  --region "$REGION" \
  --cache-control "no-cache, no-store, must-revalidate"

S3_URL="http://${BUCKET_NAME}.s3-website.${REGION}.amazonaws.com"

echo ""
echo "=========================================="
echo " Frontend deployed!"
echo " URL: $S3_URL"
echo ""
echo " Open in browser to test:"
echo "   open $S3_URL"
echo "=========================================="
echo ""
echo " NOTE: Update backend CORS_ORIGIN to:"
echo "   $S3_URL"
echo " Then redeploy backend: ./deploy/04-deploy-backend.sh"
