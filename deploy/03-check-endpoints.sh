#!/usr/bin/env bash
# =============================================================================
# 03-check-endpoints.sh — Wait for DocumentDB + Redis to be ready,
# then print final endpoints and update .env.production.template
#
# Run after 01-aws-infra.sh, once clusters show "available" status.
# =============================================================================

set -euo pipefail

REGION="ap-south-1"
APP_NAME="tasksync"

echo "Checking DocumentDB status..."
DOCDB_STATUS=""
while [ "$DOCDB_STATUS" != "available" ]; do
  DOCDB_STATUS=$(aws docdb describe-db-clusters \
    --region "$REGION" \
    --db-cluster-identifier "${APP_NAME}-docdb" \
    --query 'DBClusters[0].Status' \
    --output text 2>/dev/null || echo "creating")
  echo "  DocumentDB status: $DOCDB_STATUS"
  [ "$DOCDB_STATUS" != "available" ] && sleep 30
done

echo "Checking ElastiCache status..."
REDIS_STATUS=""
while [ "$REDIS_STATUS" != "available" ]; do
  REDIS_STATUS=$(aws elasticache describe-cache-clusters \
    --region "$REGION" \
    --cache-cluster-id "${APP_NAME}-redis" \
    --query 'CacheClusters[0].CacheClusterStatus' \
    --output text 2>/dev/null || echo "creating")
  echo "  Redis status: $REDIS_STATUS"
  [ "$REDIS_STATUS" != "available" ] && sleep 30
done

# Get endpoints
DOCDB_ENDPOINT=$(aws docdb describe-db-clusters \
  --region "$REGION" \
  --db-cluster-identifier "${APP_NAME}-docdb" \
  --query 'DBClusters[0].Endpoint' \
  --output text)

REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --region "$REGION" \
  --cache-cluster-id "${APP_NAME}-redis" \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)

echo ""
echo "=========================================="
echo " Endpoints Ready"
echo "=========================================="
echo " DocumentDB: $DOCDB_ENDPOINT"
echo " Redis:      $REDIS_ENDPOINT"
echo "=========================================="
echo ""
echo "Update deploy/.env.production.template:"
echo "  Replace FILL_DOCDB_ENDPOINT → $DOCDB_ENDPOINT"
echo "  Replace FILL_REDIS_ENDPOINT → $REDIS_ENDPOINT"
echo ""

# Auto-update the template
if [ -f deploy/.env.production.template ]; then
  sed -i.bak \
    "s|FILL_DOCDB_ENDPOINT|${DOCDB_ENDPOINT}|g" \
    deploy/.env.production.template

  sed -i.bak \
    "s|FILL_REDIS_ENDPOINT|${REDIS_ENDPOINT}|g" \
    deploy/.env.production.template

  rm -f deploy/.env.production.template.bak
  echo "Updated deploy/.env.production.template with real endpoints."
  echo "Review the file, then run ./deploy/04-deploy-backend.sh"
fi
