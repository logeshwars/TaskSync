# TaskSync — AWS EC2 Deployment

## Architecture

```
Browser → S3 Static Website (Frontend)
              ↓ API calls
          EC2 (Nginx → Docker → NestJS :3000)
              ↓           ↓
        DocumentDB     ElastiCache Redis
```

## Prerequisites

1. **AWS CLI installed** — https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
2. **AWS CLI configured** — run `aws configure` with your Access Key + Secret
3. **Node 20+** on local machine
4. All commands run from **project root** (not from `deploy/`)

## Step-by-Step Deployment

### Step 1 — Configure AWS CLI (one time)

```bash
aws configure
# Enter: Access Key ID, Secret Access Key, Region (ap-south-1), output (json)
```

### Step 2 — Create all infrastructure (~10 min)

```bash
chmod +x deploy/*.sh
./deploy/01-aws-infra.sh
```

Creates: EC2, DocumentDB, ElastiCache Redis, S3 bucket, security groups.
**Save the DocumentDB password printed at the end.**

### Step 3 — Wait for DB clusters to be ready

```bash
./deploy/03-check-endpoints.sh
```

Waits until DocumentDB + Redis are available, then auto-fills endpoints into
`deploy/.env.production.template`.

### Step 4 — Review and finalize .env

```bash
cat deploy/.env.production.template
```

Verify the MONGO_URI and REDIS_HOST look correct. No FILL_ placeholders should remain.

### Step 5 — Deploy backend

```bash
./deploy/04-deploy-backend.sh
```

Copies source to EC2, builds Docker image, starts container.

### Step 6 — Deploy frontend

```bash
./deploy/05-deploy-frontend.sh
```

Builds React app pointing to EC2, uploads to S3.

### Step 7 — Update CORS and redeploy backend

After frontend deploys, you'll see the S3 URL. Update `CORS_ORIGIN` in
`deploy/.env.production.template`:

```
CORS_ORIGIN=http://your-bucket.s3-website.ap-south-1.amazonaws.com
```

Then redeploy: `./deploy/04-deploy-backend.sh`

---

## Subsequent Deploys

**Backend code change:**
```bash
./deploy/04-deploy-backend.sh
```

**Frontend code change:**
```bash
./deploy/05-deploy-frontend.sh
```

---

## Useful Commands

```bash
# SSH into backend EC2
ssh -i ~/.ssh/tasksync-key.pem ubuntu@<EC2_IP>

# View backend logs
ssh -i ~/.ssh/tasksync-key.pem ubuntu@<EC2_IP> "docker logs tasksync-backend -f"

# Restart backend container
ssh -i ~/.ssh/tasksync-key.pem ubuntu@<EC2_IP> "docker restart tasksync-backend"

# Check EC2 bootstrap log
ssh -i ~/.ssh/tasksync-key.pem ubuntu@<EC2_IP> "cat /var/log/userdata.log"
```

---

## Region

Default: `ap-south-1` (Mumbai). To change, update `REGION=` at top of each script.
