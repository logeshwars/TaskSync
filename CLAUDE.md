# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Quick Start

**Monorepo structure:** root contains `backend/` (NestJS) and `frontend/` (React+Vite). Root `package.json` orchestrates format/lint/typecheck across both.

### Build & Run

```bash
# Install all deps
npm install
npm install --prefix backend
npm install --prefix frontend

# Start infra (Mongo + Redis)
docker compose up -d mongo redis

# Parallel development
npm run lint:frontend & npm run lint:backend
npm --prefix backend run start:dev &
npm --prefix frontend run dev

# Verification (what CI runs)
npm run verify  # format:check + lint + typecheck

# Tests
npm --prefix backend run test:watch
npm --prefix frontend run test:watch
```

### Environment

Backend `.env`:
```
MONGO_URI=mongodb://localhost:27017/tasksync
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=your-secret
JWT_REFRESH_SECRET=your-secret
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
CORS_ORIGIN=http://localhost:5173
```

Frontend `.env`:
```
VITE_API_URL=http://localhost:3000/api/v1
VITE_SOCKET_URL=http://localhost:3000
```

---

## Architecture

### High-Level

Real-time collaborative task manager. **NestJS backend** (REST + Socket.IO gateway) talks to **MongoDB** (persistent state) and **Redis** (caching + pub/sub). **React frontend** uses **Redux** for board state (supports optimistic updates) and **React Query** for server-state patterns. **Socket.IO with Redis adapter** fans out mutations across all client instances.

### Backend (NestJS Modules)

Organized by feature. Each module: controller → service → schema.

| Module   | Job |
|----------|-----|
| `auth`   | Signup, login, refresh, JWT strategy, bcrypt |
| `users`  | User CRUD |
| `workspaces` | Workspace CRUD + member roles |
| `boards` | Board CRUD; hydration (lists+cards) |
| `lists`  | List CRUD within board |
| `cards`  | Card CRUD; move with position recompute |
| `comments` | Per-card threads |
| `activity` | Audit log mutations |
| `realtime` | Socket.IO gateway + room management |
| `common` | Shared guards, pipes, filters, DTOs |

**Key pattern:** Mutations happen via REST endpoints. After success, the service publishes a **domain event** to `RealtimeService.publish()`, which broadcasts to the `board:<boardId>` room. The **Redis adapter** ensures cross-instance delivery.

**Position reordering:** LexoRank-style sortable strings. Utility at `common/utils/position.ts`. Used for cheap card/list reordering without recomputing the whole list.

**Caching:** Hydrated board payloads cached at `board:<id>:hydrated` (TTL 60s). Invalidated on any card/list mutation.

### Frontend (React + Redux + React Query)

**Redux slices:**
- `authSlice` — current user, tokens
- `workspacesSlice` — available workspaces
- `boardsSlice` — active board + hydrated lists/cards
- `presenceSlice` — who is viewing the board

**React Query:** Configured for server-state patterns (refetch on window focus, background polls). Redux handles board state for optimistic updates.

**Socket.IO client:** `lib/socket.ts` wraps Socket.IO with auto-reconnect + JWT handshake. Hook `useRealtimeBoard()` subscribes to `board:<boardId>` on mount, dispatches Redux actions on incoming mutations, shows presence avatars.

**Views:** Board (Kanban), Timeline, Calendar, Reports. All read from Redux store; mutations refetch via React Query.

### Data Model

**Mongoose collections** (see README for full schema). Key invariants:
- `boards.listOrder[]` — ordered array of list IDs
- `lists.cardOrder[]` — ordered array of card IDs
- `cards.position` — float for cheap reordering
- Compound indexes: `(boardId, listId)` on cards, `(cardId, createdAt)` on comments

---

## Common Tasks

### Add a Backend Endpoint

1. Define DTO in `src/module/dto/`
2. Add to controller `src/module/module.controller.ts`
3. Implement in service `src/module/module.service.ts`
4. If mutation, call `RealtimeService.publish()` after success
5. Test: `npm --prefix backend run test:watch`

### Add a Frontend Component

1. Create in `src/components/`
2. Wire Redux state via `useAppDispatch()` / `useAppSelector()`
3. Wrap async calls with React Query or optimistic dispatch
4. Test: `npm --prefix frontend run test:watch`

### Debug Real-Time Issues

- Verify Socket.IO connection: browser DevTools → Network → WS
- Check Redis adapter is wired: `RealtimeGateway` constructor injects it
- Verify room subscription: client logs `board:subscribe`, server logs `@SubscribeMessage('board:subscribe')`
- Check event format matches `realtime/events.ts` catalog

### Run a Single Test

```bash
# Backend (Jest)
npm --prefix backend run test -- --testNamePattern="PositionHelper"

# Frontend (Vitest)
npm --prefix frontend run test -- KanbanCard
```

---

## Key Design Decisions

**Why Redux for board state?** Supports optimistic updates (user sees card move instantly; rolls back on server error). React Query alone is too async.

**Why Socket.IO + Redis adapter?** Enables horizontal scaling. A broadcast on instance A reaches all sockets on instance B. Achieves sub-100ms propagation.

**Why LexoRank positioning?** Avoids recomputing the entire list on every drag. New position is a string between two neighbors; O(1) DB update.

**Why separate `RealtimeService`?** Single sink for all events. Prevents duplicate publishes, ensures consistent event shape.

**Why refresh token rotation?** Compromised refresh token has limited blast radius. Old token becomes invalid as soon as a new one is issued.

---

## Modified Files (Current Work)

`.claude/settings.local.json` — hooks config  
`backend/src/boards/boards.controller.ts`, `boards.service.ts` — API updates (last commit: "Added additional api and integrated frontend")  

Untracked: `LOGO_SETUP.md`, `PLAN.md`, `favicon.svg`, `logo.svg`

---

## Testing & CI

- **Format** — `npm run format` (Prettier across all workspaces)
- **Lint** — `npm run lint` (ESLint backend + frontend)
- **Type check** — `npm run typecheck` (tsc --noEmit each workspace)
- **Unit tests** — `jest` (backend), `vitest` (frontend)
- **E2E** — `npm --prefix backend run test:e2e` (Supertest against live DB)

CI runs `npm run verify` which chains format:check + lint + typecheck. Ensure `npm run format` is clean before pushing.

---

## Docker & Deployment

**Local:** `docker compose up` spins up frontend, backend, mongo, redis.

**Production:** Separate Dockerfiles for backend + frontend (see `docker-compose.yml`). Backend scales to N replicas behind load balancer. Mongo replica set + Redis cluster for HA.

---

## Useful Patterns

**DTO validation:** `class-validator` decorators in DTOs. NestJS `ValidationPipe` rejects invalid payloads with 400 + error list.

**Mongoose queries:** Use `.lean()` for read-heavy endpoints (skips Mongoose overhead). Use `.select()` to project fields.

**Redux dispatch patterns:** Use `useAppDispatch()` (typed wrapper). Slices return action creators. Async logic via `createAsyncThunk()` (preferred) or raw dispatch in effects.

**Socket.IO error handling:** If a handler throws, Socket.IO swallows it. Always catch in gateway methods and return explicit error response.

**Concurrency:** Redis pub/sub is FIFO per channel. If order matters (e.g., activity log), ensure single publisher or use a queue.

---

## When Stuck

- Check git log for recent changes: `git log --oneline -10`
- Run full verify locally: `npm run verify` catches format/lint/type issues before CI
- Inspect Redux state: browser DevTools → Redux extension
- Trace socket events: server logs `@SubscribeMessage`, client DevTools → Network → WS frame inspector
- Check indexes: `db.cards.getIndexes()` in Mongo shell; missing compound index = slow queries
