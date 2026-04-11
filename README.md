# TaskSync

A real-time collaborative task management platform that helps teams organize, assign, track, and update work through Kanban-style boards and shared workspaces.

TaskSync lets users create project boards, divide work into lists (Backlog, To Do, In Progress, Done, Blocked), and manage task cards with descriptions, assignees, due dates, priorities, tags, comments, and attachments. Multiple users can collaborate on the same board with live updates pushed across all connected clients.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [High-Level Architecture](#high-level-architecture)
4. [System Components](#system-components)
5. [Data Model](#data-model)
6. [Real-Time Sync Design](#real-time-sync-design)
7. [API Surface](#api-surface)
8. [Authentication & Authorization](#authentication--authorization)
9. [Caching Strategy](#caching-strategy)
10. [Deployment Topology](#deployment-topology)
11. [Project Structure](#project-structure)
12. [Local Development](#local-development)

---

## Features

- **Workspaces & Boards** — multiple workspaces per user, multiple boards per workspace.
- **Kanban Lists** — configurable columns (Backlog, To Do, In Progress, Done, Blocked) with optional WIP limits.
- **Task Cards** — title, description, priority, tags, assignee, due date, progress, attachments, comments.
- **Drag & Drop** — move cards within and across columns; reorderable lists.
- **Real-Time Collaboration** — live updates via WebSockets so connected users see changes instantly.
- **Multiple Views** — Board, Timeline, Calendar, and Reports views over the same data.
- **Activity & Comments** — per-card discussion thread and audit trail.
- **Search & Filter** — search cards by title/tags; filter by assignee, priority, due date.
- **Auth** — JWT-based authentication; role-based access on workspaces and boards.

---

## Tech Stack

| Layer            | Technology                                       |
| ---------------- | ------------------------------------------------ |
| Frontend         | React 18, TypeScript, Vite, Redux, React Router  |
| UI               | Tailwind CSS, Radix UI / shadcn-ui, Lucide icons |
| Data Fetching    | React Query, Axios                               |
| Realtime Client  | Socket.IO client                                 |
| Backend          | NestJS (Node.js), TypeScript                     |
| Realtime Server  | Socket.IO (NestJS Gateway)                       |
| Database         | MongoDB (via Mongoose ODM)                       |
| Cache / Pub-Sub  | Redis                                            |
| Auth             | JWT (access + refresh tokens), bcrypt            |
| Container / Ops  | Docker, Docker Compose                           |
| Testing          | Vitest, React Testing Library, Jest (NestJS)     |

---

## High-Level Architecture

```
                ┌────────────────────────────────────────────────┐
                │                    Clients                     │
                │  ┌──────────────┐         ┌──────────────┐     │
                │  │  Browser A   │         │  Browser B   │     │
                │  │  React+Redux │         │  React+Redux │     │
                │  └──────┬───────┘         └──────┬───────┘     │
                └─────────┼────────────────────────┼─────────────┘
                          │ HTTPS / WSS            │
                          ▼                        ▼
                ┌────────────────────────────────────────────────┐
                │              Reverse Proxy (Nginx)             │
                └─────────────────────┬──────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │                                               │
              ▼                                               ▼
    ┌──────────────────┐                          ┌──────────────────┐
    │   NestJS API     │ ◄──── REST / JWT ───────►│   NestJS API     │
    │   (instance 1)   │                          │   (instance N)   │
    │                  │                          │                  │
    │  Modules:        │                          │  Modules:        │
    │  • Auth          │                          │  • Auth          │
    │  • Users         │                          │  • Users         │
    │  • Workspaces    │                          │  • Workspaces    │
    │  • Boards        │                          │  • Boards        │
    │  • Lists         │                          │  • Lists         │
    │  • Cards         │                          │  • Cards         │
    │  • Comments      │                          │  • Comments      │
    │  • Realtime GW   │                          │  • Realtime GW   │
    └────┬─────────┬───┘                          └────┬─────────┬───┘
         │         │                                   │         │
         │         └────────────┬──────────────────────┘         │
         │                      │                                │
         ▼                      ▼                                ▼
   ┌──────────┐         ┌──────────────┐                  ┌──────────┐
   │ MongoDB  │         │    Redis     │                  │ MongoDB  │
   │ (primary)│         │  Pub/Sub +   │                  │ (replica)│
   │          │         │  Cache +     │                  │          │
   │          │         │  Socket adpt │                  │          │
   └──────────┘         └──────────────┘                  └──────────┘
```

- **Stateless API instances** scale horizontally behind a load balancer.
- **Redis adapter** for Socket.IO broadcasts events across all instances so clients connected to different nodes still receive updates.
- **MongoDB** is the source of truth; Redis caches hot reads (boards, lists) and serves as pub/sub for real-time fan-out.

---

## System Components

### Frontend (React + TypeScript + Redux)

- **Pages**: `Index` (board), `NotFound`. Tabs switch between Board / Timeline / Calendar / Reports views.
- **Components**: `KanbanColumn`, `KanbanCard`, `NewCardDialog`, `TimelineView`, `CalendarView`, `ReportsView`.
- **State**:
  - **Redux** for global app state (auth user, current workspace/board, lists, cards, presence).
  - **React Query** for server-state caching, retries, and background refetching of REST endpoints.
- **Realtime**: a Socket.IO client subscribes to the active board room and dispatches Redux actions on incoming events.
- **Routing**: React Router for workspace, board, and card-detail routes.
- **Styling**: Tailwind + shadcn-ui primitives for composable, accessible components.

### Backend (NestJS)

Organized by feature module. Each module exposes a controller (REST), a service (business logic), Mongoose schemas, and DTOs validated with `class-validator`.

| Module       | Responsibility                                                                  |
| ------------ | ------------------------------------------------------------------------------- |
| `auth`       | Signup, login, refresh, JWT strategy, password hashing, guards.                 |
| `users`      | User profile, avatar, preferences.                                              |
| `workspaces` | CRUD on workspaces; member invites and roles.                                   |
| `boards`     | CRUD on boards; membership; settings; background.                               |
| `lists`      | CRUD on lists (columns); ordering; WIP limits.                                  |
| `cards`      | CRUD on cards; move/reorder; assignees; tags; due dates; progress.              |
| `comments`   | Per-card threaded comments.                                                     |
| `activity`   | Audit log of mutations for the activity feed.                                   |
| `realtime`   | Socket.IO gateway; room management; broadcast layer backed by Redis adapter.    |
| `common`     | Guards, interceptors, pipes, filters, shared DTOs.                              |

---

## Data Model

MongoDB collections (Mongoose schemas). All documents have `_id`, `createdAt`, `updatedAt`.

### `users`
```ts
{
  email: string;          // unique, indexed
  passwordHash: string;
  name: string;
  avatarUrl?: string;
  workspaces: ObjectId[]; // refs Workspace
}
```

### `workspaces`
```ts
{
  name: string;
  ownerId: ObjectId;       // ref User
  members: [{ userId: ObjectId, role: 'owner' | 'admin' | 'member' }];
  boards: ObjectId[];      // ref Board
}
```

### `boards`
```ts
{
  workspaceId: ObjectId;   // indexed
  title: string;
  description?: string;
  background?: string;
  members: [{ userId: ObjectId, role: 'admin' | 'member' | 'viewer' }];
  listOrder: ObjectId[];   // ordered list of List ids
}
```

### `lists`
```ts
{
  boardId: ObjectId;       // indexed
  title: string;
  color?: string;
  position: number;        // float for cheap reordering (LexoRank-style possible)
  wipLimit?: number;
  cardOrder: ObjectId[];   // ordered list of Card ids
}
```

### `cards`
```ts
{
  boardId: ObjectId;       // indexed (denormalized for fast board fetch)
  listId: ObjectId;        // indexed
  title: string;
  description?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  tags: string[];
  assignees: ObjectId[];   // ref User
  dueDate?: Date;
  progress?: number;       // 0-100
  position: number;        // ordering within list
  attachments: [{ url, name, size, uploadedBy, uploadedAt }];
  commentsCount: number;   // denormalized counter
}
```

### `comments`
```ts
{
  cardId: ObjectId;        // indexed
  authorId: ObjectId;
  body: string;
  mentions: ObjectId[];
}
```

### `activities`
```ts
{
  boardId: ObjectId;       // indexed
  cardId?: ObjectId;
  actorId: ObjectId;
  type: 'card.created' | 'card.moved' | 'card.updated' | 'comment.added' | ...;
  payload: object;
}
```

**Indexes:** compound `(boardId, listId)` on `cards`, `(cardId, createdAt)` on `comments`, text index on card titles for search.

---

## Real-Time Sync Design

### Goals
- Updates from one client appear on every other connected client within ~100 ms.
- Survive horizontal scaling: works whether clients are on the same node or different nodes.
- Eventually consistent with the database; no client may observe state that contradicts the server.

### Mechanics

1. **Rooms.** When a client opens a board, the Socket.IO gateway joins the socket to a `board:<boardId>` room (after verifying membership via JWT).
2. **Mutations.** All write operations go through REST endpoints (HTTP). Writes are atomic at the document level.
3. **Fan-out.** After a successful mutation, the service emits a domain event (e.g. `card.moved`, `card.updated`) to the realtime gateway, which broadcasts it to the relevant room.
4. **Cross-instance.** Socket.IO uses the **Redis adapter** so a broadcast on instance A reaches sockets connected to instance B.
5. **Client reconciliation.** The frontend reducer applies the event to Redux state. React Query caches are invalidated for the affected board/list. Optimistic updates rolled back on server error.
6. **Presence.** Lightweight presence (who is viewing the board / who is typing) is published over a separate `presence:<boardId>` channel and stored in Redis with TTL.

### Event Catalog (server → client)

| Event             | Payload                                       |
| ----------------- | --------------------------------------------- |
| `board.updated`   | `{ boardId, patch }`                          |
| `list.created`    | `{ boardId, list }`                           |
| `list.updated`    | `{ boardId, listId, patch }`                  |
| `list.deleted`    | `{ boardId, listId }`                         |
| `card.created`    | `{ boardId, listId, card }`                   |
| `card.updated`    | `{ boardId, cardId, patch }`                  |
| `card.moved`      | `{ boardId, cardId, fromListId, toListId, position }` |
| `card.deleted`    | `{ boardId, listId, cardId }`                 |
| `comment.added`   | `{ cardId, comment }`                         |
| `presence.update` | `{ boardId, users: [{ id, name, cursor? }] }` |

---

## API Surface

REST under `/api/v1`. JSON in/out. JWT in `Authorization: Bearer <token>`.

### Auth
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Workspaces
- `GET    /workspaces`
- `POST   /workspaces`
- `GET    /workspaces/:id`
- `PATCH  /workspaces/:id`
- `DELETE /workspaces/:id`
- `POST   /workspaces/:id/members`

### Boards
- `GET    /workspaces/:wsId/boards`
- `POST   /workspaces/:wsId/boards`
- `GET    /boards/:id`           ← returns board + lists + cards (hydrated)
- `PATCH  /boards/:id`
- `DELETE /boards/:id`

### Lists
- `POST   /boards/:boardId/lists`
- `PATCH  /lists/:id`
- `DELETE /lists/:id`
- `PATCH  /lists/:id/position`

### Cards
- `POST   /lists/:listId/cards`
- `PATCH  /cards/:id`
- `DELETE /cards/:id`
- `PATCH  /cards/:id/move`       ← `{ toListId, position }`

### Comments
- `GET    /cards/:cardId/comments`
- `POST   /cards/:cardId/comments`
- `DELETE /comments/:id`

---

## Authentication & Authorization

- **JWT access tokens** (short-lived, e.g. 15 min) and **refresh tokens** (long-lived, stored httpOnly cookie or rotated in DB).
- **Password hashing** with bcrypt.
- **Guards**: a global `JwtAuthGuard` protects all routes except auth endpoints; per-route `RolesGuard` checks workspace/board membership and role.
- **Socket auth**: handshake includes JWT; the gateway validates it before allowing room joins, preventing unauthenticated subscription to board events.

---

## Caching Strategy

Redis is used for three purposes:

1. **Hot read cache** — full hydrated board payloads (`board:<id>:hydrated`) are cached on read with a short TTL (e.g. 60 s) and invalidated on any mutation that affects the board.
2. **Socket.IO adapter** — `@socket.io/redis-adapter` for cross-node event broadcast.
3. **Presence & rate limiting** — keys with TTL track who is viewing a board and throttle expensive endpoints.

Cache keys are versioned by resource id; on write, the service publishes an invalidation in the same transaction-like flow as the realtime event.

---

## Deployment Topology

- **Docker Compose** for local development: `frontend`, `backend`, `mongo`, `redis`.
- **Production**: each service in its own container; backend scaled to N replicas behind Nginx; MongoDB as a managed replica set; Redis as a managed cluster.
- **Environment** is configured via `.env` files; secrets injected by the orchestrator.
- **CI** runs lint, unit tests (Vitest + Jest), and Docker image builds.

---

## Project Structure

```
Task manager/
├── backend/                  # NestJS API (to be scaffolded)
│   └── src/
│       ├── auth/
│       ├── users/
│       ├── workspaces/
│       ├── boards/
│       ├── lists/
│       ├── cards/
│       ├── comments/
│       ├── activity/
│       ├── realtime/
│       └── common/
└── frontend/                 # React + Vite + TS
    ├── public/
    └── src/
        ├── assets/
        ├── components/       # KanbanCard, KanbanColumn, NewCardDialog, ...
        │   └── ui/           # shadcn-ui primitives
        ├── hooks/
        ├── lib/              # utils, axios client, socket client
        ├── pages/            # Index, NotFound
        ├── App.tsx
        └── main.tsx
```

---

## Local Development

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Bun or npm

### Frontend
```bash
cd frontend
npm install        # or: bun install
npm run dev        # http://localhost:5173
```

### Backend
```bash
cd backend
npm install
npm run start:dev  # http://localhost:3000
```

### Infra (Mongo + Redis)
```bash
docker compose up -d mongo redis
```

### Environment Variables
```
# backend/.env
MONGO_URI=mongodb://localhost:27017/tasksync
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
CORS_ORIGIN=http://localhost:5173
```

```
# frontend/.env
VITE_API_URL=http://localhost:3000/api/v1
VITE_SOCKET_URL=http://localhost:3000
```
