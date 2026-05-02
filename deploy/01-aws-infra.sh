#!/usr/bin/env bash
# =============================================================================
# 01-aws-infra.sh — Create all AWS infrastructure for TaskSync
#
# Run ONCE from your local machine after `aws configure`.
# Creates: VPC + subnets, security groups, DocumentDB, ElastiCache, EC2, S3
#
# Usage:
#   chmod +x deploy/01-aws-infra.sh
#   ./deploy/01-aws-infra.sh
#
# Outputs a .env.production file with all endpoints filled in.
# =============================================================================

set -euo pipefail

# ── Config (change these if needed) ──────────────────────────────────────────
APP_NAME="tasksync"
REGION="ap-south-1"           # Mumbai — change to your preferred region
EC2_INSTANCE_TYPE="t3.small"
EC2_AMI="ami-0f58b397bc5c1f2e8" # Ubuntu 22.04 LTS ap-south-1 (update if needed)
KEY_PAIR_NAME="tasksync-key"
DOCDB_INSTANCE_CLASS="db.t3.medium"
DOCDB_MASTER_USER="tasksync_admin"
DOCDB_MASTER_PASS="$(openssl rand -hex 16)"
REDIS_NODE_TYPE="cache.t3.micro"

echo "=========================================="
echo " TaskSync AWS Infrastructure Setup"
echo " Region: $REGION"
echo "=========================================="

# ── 1. Create Key Pair ────────────────────────────────────────────────────────
echo "[1/8] Creating EC2 key pair..."
aws ec2 create-key-pair \
  --key-name "$KEY_PAIR_NAME" \
  --region "$REGION" \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/${KEY_PAIR_NAME}.pem
chmod 400 ~/.ssh/${KEY_PAIR_NAME}.pem
echo "  Key saved to ~/.ssh/${KEY_PAIR_NAME}.pem"

# ── 2. Get Default VPC ────────────────────────────────────────────────────────
echo "[2/8] Getting default VPC..."
VPC_ID=$(aws ec2 describe-vpcs \
  --region "$REGION" \
  --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' \
  --output text)
echo "  VPC: $VPC_ID"

# Get all subnets in default VPC
SUBNET_IDS=$(aws ec2 describe-subnets \
  --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].SubnetId' \
  --output text | tr '\t' ',')
SUBNET_1=$(echo $SUBNET_IDS | cut -d',' -f1)
SUBNET_2=$(echo $SUBNET_IDS | cut -d',' -f2)
echo "  Subnets: $SUBNET_1, $SUBNET_2"

# ── 3. Security Groups ────────────────────────────────────────────────────────
echo "[3/8] Creating security groups..."

# Backend EC2 SG — allow HTTP, HTTPS, app port, SSH
BACKEND_SG=$(aws ec2 create-security-group \
  --region "$REGION" \
  --group-name "${APP_NAME}-backend-sg" \
  --description "TaskSync backend EC2" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$BACKEND_SG" \
  --ip-permissions \
  '[{"IpProtocol":"tcp","FromPort":22,"ToPort":22,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},
    {"IpProtocol":"tcp","FromPort":80,"ToPort":80,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},
    {"IpProtocol":"tcp","FromPort":443,"ToPort":443,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},
    {"IpProtocol":"tcp","FromPort":3000,"ToPort":3000,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]'
echo "  Backend SG: $BACKEND_SG"

# DocumentDB SG — allow 27017 from backend SG only
DOCDB_SG=$(aws ec2 create-security-group \
  --region "$REGION" \
  --group-name "${APP_NAME}-docdb-sg" \
  --description "TaskSync DocumentDB" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$DOCDB_SG" \
  --protocol tcp --port 27017 --source-group "$BACKEND_SG"
echo "  DocumentDB SG: $DOCDB_SG"

# Redis SG — allow 6379 from backend SG only
REDIS_SG=$(aws ec2 create-security-group \
  --region "$REGION" \
  --group-name "${APP_NAME}-redis-sg" \
  --description "TaskSync ElastiCache Redis" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$REDIS_SG" \
  --protocol tcp --port 6379 --source-group "$BACKEND_SG"
echo "  Redis SG: $REDIS_SG"

# ── 4. DocumentDB Subnet Group ────────────────────────────────────────────────
echo "[4/8] Creating DocumentDB cluster..."
aws docdb create-db-subnet-group \
  --region "$REGION" \
  --db-subnet-group-name "${APP_NAME}-docdb-subnets" \
  --db-subnet-group-description "TaskSync DocumentDB subnets" \
  --subnet-ids "$SUBNET_1" "$SUBNET_2" > /dev/null

aws docdb create-db-cluster \
  --region "$REGION" \
  --db-cluster-identifier "${APP_NAME}-docdb" \
  --engine docdb \
  --engine-version "5.0.0" \
  --master-username "$DOCDB_MASTER_USER" \
  --master-user-password "$DOCDB_MASTER_PASS" \
  --db-subnet-group-name "${APP_NAME}-docdb-subnets" \
  --vpc-security-group-ids "$DOCDB_SG" \
  --no-deletion-protection > /dev/null

aws docdb create-db-instance \
  --region "$REGION" \
  --db-instance-identifier "${APP_NAME}-docdb-instance" \
  --db-cluster-identifier "${APP_NAME}-docdb" \
  --db-instance-class "$DOCDB_INSTANCE_CLASS" \
  --engine docdb > /dev/null

echo "  DocumentDB cluster created (takes ~5 min to become available)"

# ── 5. ElastiCache Redis ──────────────────────────────────────────────────────
echo "[5/8] Creating ElastiCache Redis..."
aws elasticache create-cache-subnet-group \
  --region "$REGION" \
  --cache-subnet-group-name "${APP_NAME}-redis-subnets" \
  --cache-subnet-group-description "TaskSync Redis subnets" \
  --subnet-ids "$SUBNET_1" "$SUBNET_2" > /dev/null

aws elasticache create-cache-cluster \
  --region "$REGION" \
  --cache-cluster-id "${APP_NAME}-redis" \
  --cache-node-type "$REDIS_NODE_TYPE" \
  --engine redis \
  --engine-version "7.0" \
  --num-cache-nodes 1 \
  --cache-subnet-group-name "${APP_NAME}-redis-subnets" \
  --security-group-ids "$REDIS_SG" > /dev/null

echo "  ElastiCache Redis created (takes ~5 min to become available)"

# ── 6. EC2 Instance ───────────────────────────────────────────────────────────
echo "[6/8] Launching EC2 instance..."
EC2_INSTANCE_ID=$(aws ec2 run-instances \
  --region "$REGION" \
  --image-id "$EC2_AMI" \
  --instance-type "$EC2_INSTANCE_TYPE" \
  --key-name "$KEY_PAIR_NAME" \
  --security-group-ids "$BACKEND_SG" \
  --user-data file://deploy/02-ec2-userdata.sh \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${APP_NAME}-backend}]" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "  EC2 instance: $EC2_INSTANCE_ID"
echo "  Waiting for instance to be running..."
aws ec2 wait instance-running --region "$REGION" --instance-ids "$EC2_INSTANCE_ID"

EC2_PUBLIC_IP=$(aws ec2 describe-instances \
  --region "$REGION" \
  --instance-ids "$EC2_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

EC2_PUBLIC_DNS=$(aws ec2 describe-instances \
  --region "$REGION" \
  --instance-ids "$EC2_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicDnsName' \
  --output text)

echo "  EC2 Public IP:  $EC2_PUBLIC_IP"
echo "  EC2 Public DNS: $EC2_PUBLIC_DNS"

# ── 7. S3 Bucket for Frontend ─────────────────────────────────────────────────
echo "[7/8] Creating S3 bucket for frontend..."
BUCKET_NAME="${APP_NAME}-frontend-$(date +%s)"

aws s3 mb "s3://$BUCKET_NAME" --region "$REGION"

aws s3api put-bucket-website \
  --bucket "$BUCKET_NAME" \
  --website-configuration '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"index.html"}}'

aws s3api delete-public-access-block --bucket "$BUCKET_NAME"

aws s3api put-bucket-policy --bucket "$BUCKET_NAME" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"PublicReadGetObject\",
    \"Effect\": \"Allow\",
    \"Principal\": \"*\",
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::${BUCKET_NAME}/*\"
  }]
}"

echo "  S3 bucket: $BUCKET_NAME"

# ── 8. Save credentials and endpoints ────────────────────────────────────────
echo "[8/8] Saving output..."

cat > deploy/.env.production.template << EOF
# Generated by 01-aws-infra.sh — $(date)
# Fill in DOCDB_ENDPOINT and REDIS_ENDPOINT once clusters are ready (~5-10 min)
# Run: aws docdb describe-db-clusters --region $REGION --query 'DBClusters[0].Endpoint' --output text
# Run: aws elasticache describe-cache-clusters --region $REGION --show-cache-node-info --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text

NODE_ENV=production
PORT=3000
LOG_LEVEL=info

MONGO_URI=mongodb://${DOCDB_MASTER_USER}:${DOCDB_MASTER_PASS}@FILL_DOCDB_ENDPOINT:27017/tasksync?tls=true&tlsCAFile=/etc/ssl/certs/global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false

REDIS_HOST=FILL_REDIS_ENDPOINT
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_ACCESS_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

CORS_ORIGIN=http://${EC2_PUBLIC_DNS}
EOF

cat > deploy/infra-outputs.txt << EOF
========================================
 TaskSync Infrastructure Outputs
 Created: $(date)
========================================

EC2 Instance ID:  $EC2_INSTANCE_ID
EC2 Public IP:    $EC2_PUBLIC_IP
EC2 Public DNS:   $EC2_PUBLIC_DNS
EC2 SSH:          ssh -i ~/.ssh/${KEY_PAIR_NAME}.pem ubuntu@$EC2_PUBLIC_IP

DocumentDB Cluster: ${APP_NAME}-docdb
DocumentDB User:    $DOCDB_MASTER_USER
DocumentDB Pass:    $DOCDB_MASTER_PASS
  (get endpoint after ~5min):
  aws docdb describe-db-clusters --region $REGION --db-cluster-identifier ${APP_NAME}-docdb --query 'DBClusters[0].Endpoint' --output text

ElastiCache Redis:  ${APP_NAME}-redis
  (get endpoint after ~5min):
  aws elasticache describe-cache-clusters --region $REGION --cache-cluster-id ${APP_NAME}-redis --show-cache-node-info --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text

S3 Bucket:        $BUCKET_NAME
S3 Website URL:   http://${BUCKET_NAME}.s3-website.${REGION}.amazonaws.com

Region: $REGION
Key Pair: ~/.ssh/${KEY_PAIR_NAME}.pem

Next steps:
  1. Wait 5-10 min for DocumentDB + Redis to become available
  2. Run: ./deploy/03-check-endpoints.sh  (fills in the endpoints)
  3. Run: ./deploy/04-deploy-backend.sh   (deploys backend to EC2)
  4. Run: ./deploy/05-deploy-frontend.sh  (builds + uploads frontend to S3)
========================================
EOF

echo ""
echo "=========================================="
echo " Infrastructure creation started!"
echo " Outputs saved to deploy/infra-outputs.txt"
echo " IMPORTANT: Save DocumentDB password:"
echo "   $DOCDB_MASTER_PASS"
echo "=========================================="
cat deploy/infra-outputs.txt
