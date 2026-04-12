/**
 * E2E test — auth flow + board hydration + card move.
 *
 * Prerequisites:
 *   - MongoDB running at MONGO_URI (docker-compose up mongo).
 *   - Redis running at REDIS_URL (docker-compose up redis).
 *
 * These tests hit the real Mongo/Redis instances to validate the full
 * stack. They run against the compiled AppModule, so they catch wiring
 * issues that unit tests miss (wrong module imports, guard ordering, etc).
 *
 * Each test uses a unique email to avoid collision across parallel runs.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from 'src/app.module';

let app: INestApplication;
let accessToken: string;
let refreshToken: string;
let userId: string;

const uniqueEmail = `e2e-${Date.now()}@test.com`;
const password = 'Test1234!';

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
}, 30_000);

afterAll(async () => {
  await app?.close();
});

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

describe('Auth', () => {
  it('POST /auth/signup creates a user and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({ email: uniqueEmail, password, name: 'E2E Tester' })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(uniqueEmail);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
    userId = res.body.user.id;
  });

  it('POST /auth/login succeeds with correct credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('POST /auth/login rejects wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'WrongPass1!' })
      .expect(401);
  });

  it('GET /auth/me returns the authenticated user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(userId);
    expect(res.body.email).toBe(uniqueEmail);
  });

  it('POST /auth/refresh rotates the refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(refreshToken);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });
});

// ---------------------------------------------------------------------------
// Board hydration
// ---------------------------------------------------------------------------

describe('Board hydration', () => {
  let workspaceSlug: string;
  let boardId: string;

  it('creates a workspace', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `E2E Workspace ${Date.now()}` })
      .expect(201);

    workspaceSlug = res.body.slug;
    expect(workspaceSlug).toBeDefined();
  });

  it('creates a board in the workspace', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceSlug}/boards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'E2E Board', description: 'test' })
      .expect(201);

    boardId = res.body.id;
    expect(boardId).toBeDefined();
  });

  it('GET /boards/:id returns hydrated board with lists and cards arrays', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/boards/${boardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(boardId);
    expect(Array.isArray(res.body.lists)).toBe(true);
    expect(Array.isArray(res.body.cards)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Card move
  // ---------------------------------------------------------------------------

  describe('Card move', () => {
    let listAId: string;
    let listBId: string;
    let cardId: string;

    it('creates two lists', async () => {
      const a = await request(app.getHttpServer())
        .post(`/api/v1/boards/${boardId}/lists`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'List A' })
        .expect(201);
      listAId = a.body.id;

      const b = await request(app.getHttpServer())
        .post(`/api/v1/boards/${boardId}/lists`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'List B' })
        .expect(201);
      listBId = b.body.id;
    });

    it('creates a card in List A', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/lists/${listAId}/cards`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'E2E Card' })
        .expect(201);

      cardId = res.body.id;
      expect(res.body.listId).toBe(listAId);
    });

    it('moves the card from List A to List B', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/cards/${cardId}/move`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetListId: listBId })
        .expect(200);

      expect(res.body.listId).toBe(listBId);
    });

    it('hydrated board shows the card in List B', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/boards/${boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const card = res.body.cards.find((c: any) => c.id === cardId);
      expect(card).toBeDefined();
      expect(card.listId).toBe(listBId);
    });
  });
});
