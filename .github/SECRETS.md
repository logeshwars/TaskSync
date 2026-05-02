# GitHub Actions Secrets Setup

Go to: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

Add these secrets before the deploy pipeline runs.

## Required Secrets

### AWS Credentials (for S3 frontend deploy)

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_REGION` | e.g. `ap-south-1` |

### EC2 (for backend deploy)

| Secret | Value |
|--------|-------|
| `EC2_HOST` | EC2 public IP — from `deploy/infra-outputs.txt` |
| `EC2_SSH_KEY` | Contents of `~/.ssh/tasksync-key.pem` (full private key including header/footer) |

### Backend Environment

| Secret | Value |
|--------|-------|
| `MONGO_URI` | Full DocumentDB connection string from `deploy/.env.production.template` |
| `REDIS_HOST` | ElastiCache endpoint from `deploy/.env.production.template` |
| `REDIS_PASSWORD` | Leave empty if no auth |
| `JWT_ACCESS_SECRET` | Same value as in `deploy/.env.production.template` |
| `JWT_REFRESH_SECRET` | Same value as in `deploy/.env.production.template` |
| `CORS_ORIGIN` | S3 website URL e.g. `http://tasksync-frontend-xxx.s3-website.ap-south-1.amazonaws.com` |

### Frontend Environment

| Secret | Value |
|--------|-------|
| `VITE_API_URL` | e.g. `http://<EC2_PUBLIC_DNS>/api/v1` |
| `VITE_SOCKET_URL` | e.g. `http://<EC2_PUBLIC_DNS>` |
| `S3_BUCKET` | S3 bucket name from `deploy/infra-outputs.txt` |

---

## IAM Permissions Needed

The IAM user (`AWS_ACCESS_KEY_ID`) needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::<your-bucket-name>",
        "arn:aws:s3:::<your-bucket-name>/*"
      ]
    }
  ]
}
```

Attach this inline policy to the IAM user. Minimal permissions — S3 only.

---

## Pipeline Triggers

| Event | Pipeline |
|-------|----------|
| Push to `main` or `dev`, or any PR | `ci.yml` — lint + typecheck + tests |
| Push to `main` only | `deploy.yml` — deploy backend + frontend |

---

## First Deploy Checklist

- [ ] Run `./deploy/01-aws-infra.sh` — infra created
- [ ] Run `./deploy/03-check-endpoints.sh` — endpoints filled
- [ ] Run `./deploy/04-deploy-backend.sh` — first manual backend deploy
- [ ] Run `./deploy/05-deploy-frontend.sh` — first manual frontend deploy
- [ ] All secrets added to GitHub
- [ ] Push to `main` — pipeline auto-deploys on every future push
