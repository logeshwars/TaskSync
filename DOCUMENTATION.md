# TaskSync — Full Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Features](#2-features)
3. [Architecture](#3-architecture)
4. [Data Models](#4-data-models)
5. [API Reference](#5-api-reference)
6. [Real-Time Events](#6-real-time-events)
7. [Frontend Structure](#7-frontend-structure)
8. [Deployment — AWS EC2](#8-deployment--aws-ec2)
9. [Local Development](#9-local-development)
10. [Environment Variables](#10-environment-variables)
11. [Technology Stack](#11-technology-stack)

---

## 1. Overview

TaskSync is a real-time collaborative task manager. Teams organize work into **workspaces → boards → lists → cards**. All mutations propagate instantly across connected clients via Socket.IO + Redis pub/sub.

```
Workspace
 └── Board (Kanban / Timeline / Calendar / Reports)
      └── List  (column)
           └── Card  (task)
                ├── Comments
                └── Activity log
```

---

## 2. Features

### Core
| Feature | Description |
|---------|-------------|
| Authentication | JWT access + refresh tokens, bcrypt password hashing, token rotation |
| Workspaces | Multi-workspace support with role-based membership (owner / admin / member / viewer) |
| Boards | Per-workspace Kanban boards; member management independent of workspace members |
| Lists | Ordered columns within boards; WIP (Work-In-Progress) limits supported |
| Cards | Full task management: priority, tags, assignees, due dates, progress (0–100%), attachments |
| Comments | Per-card threads with @mention parsing |
| Activity Log | Immutable audit trail for all mutations, paginated feed per board |
| Real-time | Sub-100ms event propagation across all connected browser tabs and users |
| Presence | Live avatars showing who is currently viewing the board |
| Views | Board (Kanban), Timeline (Gantt-style), Calendar, Reports/Charts |
| Soft delete | All entities use `archivedAt` — no hard deletes |

### Card Fields
- Title, description (rich text)
- Priority: `low` | `medium` | `high` | `urgent`
- Tags (free-form string array)
- Assignees (multiple users)
- Due date
- Progress percentage (0–100)
- Attachments array
- Comments count (denormalized for performance)

---

## 3. Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  React + Redux + Socket.IO client                           │
└──────────────────┬─────────────────────┬────────────────────┘
                   │ HTTP REST            │ WebSocket
                   ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Nginx (reverse proxy, port 80)                             │
│  → proxies HTTP + WebSocket upgrade to :3000                │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  NestJS Backend (port 3000)                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐ │
│  │  REST API    │  │ Socket.IO GW  │  │  RealtimeService │ │
│  │  Controllers │  │ (realtime/)   │  │  (event sink)    │ │
│  └──────┬───────┘  └───────┬───────┘  └────────┬─────────┘ │
│         │                  │                    │           │
│  ┌──────▼───────────────────▼────────────────────▼────────┐ │
│  │              Services (business logic)                  │ │
│  └──────┬──────────────────────────────────────┬──────────┘ │
└─────────┼──────────────────────────────────────┼────────────┘
          │                                      │
          ▼                                      ▼
┌──────────────────┐                  ┌────────────────────┐
│  MongoDB         │                  │  Redis             │
│  (DocumentDB)    │                  │  Cache + Pub/Sub   │
│  Primary store   │                  │  Socket.IO adapter │
└──────────────────┘                  └────────────────────┘
```

### Backend Modules

| Module | Responsibility |
|--------|----------------|
| `auth` | Signup, login, token refresh, logout, JWT strategy |
| `users` | User CRUD, profile |
| `workspaces` | Workspace CRUD, member invite/remove/role-change |
| `boards` | Board CRUD, hydration (lists+cards in one query), member management |
| `lists` | List CRUD, reorder with LexoRank positions, WIP limits |
| `cards` | Card CRUD, move across lists with position recompute |
| `comments` | Per-card comment threads, @mention parsing |
| `activity` | Audit log; written after every mutation |
| `realtime` | Socket.IO gateway + room management + presence tracking |
| `common` | Guards, pipes, filters, position utility, board cache service |
| `health` | Liveness probe endpoint |

### Request → Response → Event Flow

```
Client HTTP request
  → NestJS Controller
  → Guard chain (JwtAuthGuard → BoardMemberGuard → RolesGuard)
  → Service (business logic + MongoDB write)
  → RealtimeService.publish(boardId, event)    ← all mutations end here
  → Redis Pub/Sub
  → Socket.IO adapter fans out to all instances
  → board:<boardId> room receives event
  → All subscribed browser tabs update instantly
```

### Caching Strategy

- Hydrated board payload (board + all lists + all cards) cached in Redis
- Key: `board:<id>:hydrated` — TTL: 60 seconds
- Invalidated on **any** card or list mutation
- Cold miss: MongoDB query + cache set; warm hit: Redis read (< 5ms)

### Position Algorithm (LexoRank-lite)

File: `backend/src/common/utils/position.ts`

- Cards and lists ordered by sortable string positions
- `midPosition(prev, next)` generates string lexicographically between two neighbors
- Drag-drop reorder = O(1) DB update (single card, no list recompute)
- Supports ~64 levels of subdivision before rebalancing needed

### Auth Flow

```
POST /auth/signup  →  create user, return access + refresh token
POST /auth/login   →  verify password, return tokens
POST /auth/refresh →  rotate refresh token (old becomes invalid)
POST /auth/logout  →  revoke refresh token hash from DB

Access token:  15m TTL, sent in Authorization header
Refresh token: 7d TTL, stored as bcrypt hash in user document
```

### Guard Chain

```
JwtAuthGuard (global, opt-out via @Public())
  └── WorkspaceMemberGuard  — resolves workspace role
       └── BoardMemberGuard — resolves effective board role
            └── RolesGuard  — enforces @Roles('admin') etc.
```

---

## 4. Data Models

### User
```typescript
{
  _id: ObjectId,
  email: string,           // unique index
  passwordHash: string,    // hidden from all responses
  name: string,
  avatarUrl?: string,
  refreshTokenHashes: string[]  // hidden; supports multi-device
}
```

### Workspace
```typescript
{
  _id: ObjectId,
  name: string,
  slug: string,            // unique, URL-safe identifier
  description?: string,
  ownerId: ObjectId,
  members: [{
    userId: ObjectId,
    role: 'owner' | 'admin' | 'member' | 'viewer',
    joinedAt: Date
  }]
}
```

### Board
```typescript
{
  _id: ObjectId,
  workspaceId: ObjectId,
  title: string,
  description?: string,
  color?: string,
  createdBy: ObjectId,
  members: [{ userId, role }],
  listOrder: ObjectId[],   // ordered list IDs
  archivedAt?: Date
}
```

### List
```typescript
{
  _id: ObjectId,
  boardId: ObjectId,
  title: string,
  position: string,        // LexoRank sortable string
  wipLimit?: number,       // 0 = unlimited
  cardOrder: ObjectId[],   // ordered card IDs
  archivedAt?: Date
}
```

### Card
```typescript
{
  _id: ObjectId,
  boardId: ObjectId,       // denormalized for fast board-level queries
  listId: ObjectId,
  title: string,
  description?: string,
  priority: 'low' | 'medium' | 'high' | 'urgent',
  tags: string[],
  assignees: ObjectId[],
  dueDate?: Date,
  progress: number,        // 0-100
  position: string,        // LexoRank
  attachments: [{ filename, url, uploadedAt }],
  commentsCount: number,   // denormalized
  createdBy: ObjectId,
  archivedAt?: Date
}

// Indexes:
// - text index on (title, description)  → full-text search
// - compound (boardId, listId, position) → fast list queries
```

### Comment
```typescript
{
  _id: ObjectId,
  cardId: ObjectId,
  boardId: ObjectId,       // denormalized for fast invalidation
  authorId: ObjectId,
  body: string,
  mentions: ObjectId[],    // parsed @mentions
  editedAt?: Date
}

// Index: (cardId, createdAt DESC)
```

### Activity
```typescript
{
  _id: ObjectId,
  boardId: ObjectId,
  cardId?: ObjectId,
  actorId: ObjectId,
  type: string,            // 'card.created' | 'card.moved' | etc.
  payload: object,         // free-form event data
  createdAt: Date
}

// Index: (boardId, createdAt DESC) → paginated feed
```

---

## 5. API Reference

Base URL: `http://<host>/api/v1`

All endpoints require `Authorization: Bearer <access_token>` except `/auth/signup` and `/auth/login`.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/signup` | Create account |
| POST | `/auth/login` | Authenticate, receive tokens |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/auth/me` | Current user profile |

### Workspaces

| Method | Path | Auth Required |
|--------|------|---------------|
| GET | `/workspaces` | List user's workspaces |
| POST | `/workspaces` | Create workspace |
| GET | `/workspaces/:slug` | Get workspace |
| PATCH | `/workspaces/:slug` | Update (admin+) |
| DELETE | `/workspaces/:slug` | Delete (owner) |
| POST | `/workspaces/:slug/members` | Invite member (admin+) |
| PATCH | `/workspaces/:slug/members/:userId` | Change role (admin+) |
| DELETE | `/workspaces/:slug/members/:userId` | Remove member (admin+) |

### Boards

| Method | Path | Notes |
|--------|------|-------|
| GET | `/workspaces/:slug/boards` | List boards in workspace |
| POST | `/workspaces/:slug/boards` | Create board |
| GET | `/boards/:id` | Get hydrated board (lists + cards) — cached 60s |
| PATCH | `/boards/:id` | Update metadata (admin+) |
| DELETE | `/boards/:id` | Delete (owner) |
| POST | `/boards/:id/members` | Add board member (admin+) |
| DELETE | `/boards/:id/members/:userId` | Remove board member (admin+) |

### Lists

| Method | Path | Notes |
|--------|------|-------|
| GET | `/boards/:boardId/lists` | All lists on board |
| POST | `/boards/:boardId/lists` | Create list |
| PATCH | `/lists/:id` | Update title or WIP limit |
| PATCH | `/lists/:id/reorder` | Move list (changes position string) |
| DELETE | `/lists/:id` | Delete list (admin+) |

### Cards

| Method | Path | Notes |
|--------|------|-------|
| GET | `/boards/:boardId/cards` | All cards on board |
| POST | `/lists/:id/cards` | Create card in list |
| GET | `/cards/:id` | Get single card |
| PATCH | `/cards/:id` | Update any card field |
| PATCH | `/cards/:id/move` | Move to different list or reorder |
| DELETE | `/cards/:id` | Delete card |

### Comments

| Method | Path | Notes |
|--------|------|-------|
| GET | `/cards/:id/comments` | Paginated comments (newest first) |
| POST | `/cards/:id/comments` | Add comment |
| DELETE | `/comments/:id` | Delete (author only) |

### Activity

| Method | Path | Notes |
|--------|------|-------|
| GET | `/boards/:boardId/activity` | Paginated feed (`?limit=20&before=<timestamp>`) |

### Health

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Liveness probe; checks Redis connectivity |

---

## 6. Real-Time Events

### Connection

```javascript
// Client connects with JWT in handshake
const socket = io('http://<host>', {
  auth: { token: '<access_token>' }
})

// Subscribe to board room
socket.emit('board:subscribe', { boardId: '<id>' })

// Unsubscribe
socket.emit('board:unsubscribe', { boardId: '<id>' })
```

### Event Envelope

All server-sent events share this envelope:
```typescript
{
  boardId: string,
  actorId: string,   // suppresses echo on originating client
  data: object,      // event-specific payload
  at: number         // unix timestamp ms
}
```

### Server → Client Events

| Event | Payload fields |
|-------|----------------|
| `card.created` | cardId, title, listId, priority, assignees, dueDate |
| `card.updated` | cardId, changed fields |
| `card.moved` | cardId, fromListId, toListId, position |
| `card.deleted` | cardId |
| `list.created` | listId, title, position |
| `list.updated` | listId, changed fields |
| `list.reordered` | listId, position |
| `list.deleted` | listId |
| `board.updated` | boardId, changed fields |
| `comment.added` | commentId, cardId, authorId, body, mentions |
| `comment.deleted` | commentId, cardId |
| `presence.joined` | userId, email, joinedAt |
| `presence.left` | userId |

### Multi-Instance Delivery

Socket.IO Redis adapter ensures events published on instance A reach all sockets on instance B:

```
NestJS instance 1  →  RealtimeService.publish()
                   →  Redis Pub/Sub channel
                   →  Socket.IO Redis Adapter
                   →  NestJS instance 2 sockets  →  browsers
                   →  NestJS instance 1 sockets  →  browsers
```

---

## 7. Frontend Structure

```
frontend/src/
├── components/
│   ├── ui/                     # 50+ shadcn-ui primitives
│   ├── KanbanCard.tsx          # Task card (drag source)
│   ├── KanbanColumn.tsx        # List column (drop target)
│   ├── CardDetailDrawer.tsx    # Side panel: details, comments, activity
│   ├── NewCardDialog.tsx       # Create card modal
│   ├── WorkspaceBoardSelector.tsx   # Nav dropdown
│   ├── CreateOrganizationDialog.tsx # Create workspace
│   ├── InviteMemberDialog.tsx       # Invite member
│   ├── PresenceAvatars.tsx          # Live viewer avatars
│   ├── CalendarView.tsx             # Due-date calendar
│   ├── TimelineView.tsx             # Gantt-style view
│   ├── ReportsView.tsx              # Charts & metrics
│   └── ProtectedRoute.tsx           # Auth guard
├── pages/
│   ├── auth/LoginPage.tsx
│   ├── auth/SignupPage.tsx
│   ├── Index.tsx               # Main app layout + router
│   └── NotFound.tsx
├── store/
│   ├── index.ts                # Redux store config
│   ├── auth.slice.ts           # User identity, JWT tokens
│   ├── boards.slice.ts         # Active board + lists + cards
│   ├── workspaces.slice.ts     # Workspace list
│   └── presence.slice.ts       # Who's viewing board live
├── hooks/
│   ├── use-realtime-board.ts   # Socket.IO → Redux dispatcher
│   ├── use-mobile.tsx          # Responsive breakpoint
│   └── use-toast.ts            # Toast notifications
└── lib/
    ├── api.ts                  # Axios client + JWT interceptor + auto-refresh
    ├── socket.ts               # Socket.IO connection manager
    ├── board-transform.ts      # API response → Redux shape
    └── utils.ts                # Tailwind helpers
```

### State Architecture

```
Redux Store
├── auth        — current user, login state, token management
├── workspaces  — workspace list, selected workspace
├── boards      — active board, all lists, all cards (optimistic updates)
└── presence    — real-time viewer set

React Query (server-state)
└── Used alongside Redux for refetch-on-focus, background polls
    Redux owns board state for optimistic drag-drop
```

### Optimistic Updates Flow

```
User drags card to new list
  → Redux dispatches optimistic move (board state updates immediately)
  → REST PATCH /cards/:id/move fires
  → Socket.IO receives card.moved event from server
  → Redux confirms update (or rolls back on error)
  → Other users see card.moved event → their Redux updates too
```

---

## 8. Deployment — AWS EC2

### Infrastructure Overview

```
Browser
  ↓
S3 Static Website (React build)           ← frontend machine
  ↓ API + WebSocket
EC2 (Ubuntu + Nginx + Docker)             ← backend machine
  ↓                     ↓
DocumentDB (MongoDB)    ElastiCache (Redis)
```

### Prerequisites

- AWS account with IAM user (AdministratorAccess for setup)
- AWS CLI v2 installed locally
- Node 20+ on local machine
- Git repository cloned locally

### Step 1 — Configure AWS CLI

```bash
aws configure
# AWS Access Key ID: <from IAM → Security credentials>
# AWS Secret Access Key: <from IAM>
# Default region: ap-south-1
# Default output format: json
```

### Step 2 — Create All Infrastructure

```bash
chmod +x deploy/*.sh
./deploy/01-aws-infra.sh
```

Creates in one shot:
- EC2 t3.small (Ubuntu 22.04) with Docker + Nginx auto-installed
- DocumentDB 5.0 cluster + instance
- ElastiCache Redis 7.0 cluster
- S3 bucket with static hosting enabled
- Security groups (DocumentDB + Redis accessible only from EC2)
- EC2 key pair saved to `~/.ssh/tasksync-key.pem`

Output saved to `deploy/infra-outputs.txt`.

### Step 3 — Wait for Databases (~10 min)

```bash
./deploy/03-check-endpoints.sh
```

Polls until DocumentDB + Redis show `available`. Auto-fills real endpoints into `deploy/.env.production.template`.

### Step 4 — Review Production .env

```bash
cat deploy/.env.production.template
```

Verify no `FILL_` placeholders remain. Check MONGO_URI, REDIS_HOST, JWT secrets.

### Step 5 — Deploy Backend

```bash
./deploy/04-deploy-backend.sh
```

Rsyncs source to EC2, builds production Docker image, starts container with `--restart unless-stopped`.

Verify: `curl http://<EC2_IP>/api/v1/health`

### Step 6 — Deploy Frontend

```bash
./deploy/05-deploy-frontend.sh
```

Builds React with `VITE_API_URL` pointing to EC2, uploads to S3. Prints S3 website URL.

### Step 7 — Update CORS

Edit `deploy/.env.production.template`:
```
CORS_ORIGIN=http://<bucket>.s3-website.ap-south-1.amazonaws.com
```

Redeploy backend: `./deploy/04-deploy-backend.sh`

### Re-deploying After Code Changes

```bash
# Backend change
./deploy/04-deploy-backend.sh

# Frontend change
./deploy/05-deploy-frontend.sh
```

### SSH & Logs

```bash
# SSH into EC2
ssh -i ~/.ssh/tasksync-key.pem ubuntu@<EC2_IP>

# Stream backend logs
ssh -i ~/.ssh/tasksync-key.pem ubuntu@<EC2_IP> "docker logs tasksync-backend -f"

# Restart backend
ssh -i ~/.ssh/tasksync-key.pem ubuntu@<EC2_IP> "docker restart tasksync-backend"

# Check EC2 bootstrap log
ssh -i ~/.ssh/tasksync-key.pem ubuntu@<EC2_IP> "cat /var/log/userdata.log"
```

### Security Groups

| Group | Inbound |
|-------|---------|
| `tasksync-backend-sg` | 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (direct) from `0.0.0.0/0` |
| `tasksync-docdb-sg` | 27017 from `tasksync-backend-sg` only |
| `tasksync-redis-sg` | 6379 from `tasksync-backend-sg` only |

### DocumentDB Notes

DocumentDB requires TLS. Connection string format:
```
mongodb://user:pass@<endpoint>:27017/tasksync?tls=true&tlsCAFile=/etc/ssl/certs/global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false
```

`global-bundle.pem` is downloaded to EC2 automatically by the bootstrap script.

---

## 9. Local Development

```bash
# Install all deps
npm install
npm install --prefix backend
npm install --prefix frontend

# Start MongoDB + Redis
docker compose up -d mongo redis

# Run backend (hot reload)
npm --prefix backend run start:dev

# Run frontend (hot reload)
npm --prefix frontend run dev
```

Frontend: http://localhost:5173
Backend API: http://localhost:3000/api/v1
Swagger docs: http://localhost:3000/api

### Run Tests

```bash
# Backend unit tests (watch)
npm --prefix backend run test:watch

# Backend e2e tests (needs live Mongo)
npm --prefix backend run test:e2e

# Frontend tests (watch)
npm --prefix frontend run test:watch

# Single test
npm --prefix backend run test -- --testNamePattern="PositionHelper"
npm --prefix frontend run test -- KanbanCard
```

### Verify Before Push

```bash
npm run verify   # format:check + lint + typecheck (same as CI)
npm run format   # auto-fix formatting
```

---

## 10. Environment Variables

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | yes | `development` or `production` |
| `PORT` | yes | HTTP port (default 3000) |
| `LOG_LEVEL` | yes | `fatal\|error\|warn\|info\|debug\|trace` |
| `MONGO_URI` | yes | MongoDB / DocumentDB connection string |
| `REDIS_HOST` | yes | Redis / ElastiCache host |
| `REDIS_PORT` | yes | Redis port (default 6379) |
| `REDIS_PASSWORD` | no | Redis auth password |
| `JWT_ACCESS_SECRET` | yes | Min 32 chars |
| `JWT_REFRESH_SECRET` | yes | Min 32 chars |
| `JWT_ACCESS_TTL` | yes | e.g. `15m` |
| `JWT_REFRESH_TTL` | yes | e.g. `7d` |
| `CORS_ORIGIN` | yes | Frontend origin URL |

### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend REST base URL e.g. `http://<host>/api/v1` |
| `VITE_SOCKET_URL` | Backend Socket.IO URL e.g. `http://<host>` |

---

## 11. Technology Stack

### Backend
| Package | Version | Purpose |
|---------|---------|---------|
| NestJS | 10.4.0 | Framework |
| TypeScript | 5.x | Language |
| Mongoose | 10.0.10 | MongoDB ODM |
| ioredis | 5.4.1 | Redis client |
| Socket.IO | 4.7.5 | WebSocket server |
| @socket.io/redis-adapter | latest | Multi-instance pub/sub |
| passport-jwt | latest | JWT strategy |
| bcrypt | latest | Password hashing |
| Joi | latest | Env validation |
| class-validator | latest | DTO validation |
| Jest + Supertest | latest | Testing |

### Frontend
| Package | Version | Purpose |
|---------|---------|---------|
| React | 18.3.1 | UI framework |
| Vite | 5.4.19 | Build tool |
| Redux Toolkit | 2.11.2 | State management |
| React Router | 6.30.1 | Routing |
| Axios | 1.15.0 | HTTP client |
| Socket.IO Client | 4.8.3 | WebSocket client |
| React Hook Form + zod | latest | Form validation |
| Radix UI + shadcn-ui | latest | UI components |
| Tailwind CSS | 3.4.17 | Styling |
| Recharts | 2.15.4 | Charts (Reports view) |
| Sonner | 1.7.4 | Toast notifications |
| Vitest + RTL | latest | Testing |

### Infrastructure
| Service | Purpose |
|---------|---------|
| AWS EC2 (t3.small) | Backend server |
| AWS S3 | Frontend static hosting |
| AWS DocumentDB | MongoDB-compatible database |
| AWS ElastiCache | Redis cache + Socket.IO adapter |
| Docker | Backend containerization |
| Nginx | Reverse proxy + WebSocket upgrade |
