/**
 * AuthService unit tests.
 *
 * These tests intentionally stub UsersService and JwtService rather than
 * spinning up a real Mongo / Nest test container. We want fast, hermetic
 * coverage of:
 *
 *   - Password hashing on signup
 *   - Credential verification on login (and the constant-time error)
 *   - Refresh-token rotation (issue → verify → rotate → drop old)
 *   - Reuse detection (presenting an already-rotated refresh token wipes
 *     all refresh hashes for that user)
 *
 * If a test ever needs a *real* Mongo, it belongs in an e2e suite, not here.
 */
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';

import { AuthService } from './auth.service';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface FakeUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  refreshTokenHashes: string[];
}

/**
 * In-memory UsersService stub. Mimics just enough of the real surface area
 * for AuthService to function. Keeping it inline (rather than reaching for
 * jest.mock) makes the test wiring obvious at a glance.
 */
class FakeUsersService {
  public users = new Map<string, FakeUser>();

  async create(input: { email: string; passwordHash: string; name: string }): Promise<FakeUser> {
    const user: FakeUser = {
      _id: new Types.ObjectId(),
      email: input.email,
      passwordHash: input.passwordHash,
      refreshTokenHashes: [],
    };
    this.users.set(user._id.toString(), user);
    return user;
  }

  async findByEmail(email: string): Promise<FakeUser | null> {
    for (const u of this.users.values()) {
      if (u.email === email) return u;
    }
    return null;
  }

  async findById(id: string | Types.ObjectId): Promise<FakeUser | null> {
    return this.users.get(id.toString()) ?? null;
  }

  async addRefreshTokenHash(userId: Types.ObjectId, hash: string): Promise<void> {
    const u = this.users.get(userId.toString());
    if (u) u.refreshTokenHashes.push(hash);
  }

  async removeRefreshTokenHash(userId: Types.ObjectId, hash: string): Promise<void> {
    const u = this.users.get(userId.toString());
    if (u) u.refreshTokenHashes = u.refreshTokenHashes.filter((h) => h !== hash);
  }

  async clearRefreshTokens(userId: Types.ObjectId): Promise<void> {
    const u = this.users.get(userId.toString());
    if (u) u.refreshTokenHashes = [];
  }
}

/**
 * Minimal JwtService that just round-trips a JSON payload as base64. The
 * goal is *not* to test @nestjs/jwt — it's to verify our flow handles
 * payloads correctly. Real signing is exercised by e2e tests.
 */
class FakeJwtService {
  async signAsync(payload: object): Promise<string> {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  async verifyAsync<T>(token: string): Promise<T> {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf8')) as T;
  }
}

/**
 * Stub ConfigService that returns a fixed jwt config block. The signature
 * mirrors the `config.get('jwt', { infer: true })` call site.
 */
const fakeConfig = {
  get: (key: string) => {
    if (key === 'jwt') {
      return {
        accessSecret: 'test-access-secret',
        refreshSecret: 'test-refresh-secret',
        accessTtl: '15m',
        refreshTtl: '7d',
      };
    }
    return undefined;
  },
} as unknown as ConfigService;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let users: FakeUsersService;
  let jwt: FakeJwtService;
  let service: AuthService;

  beforeEach(() => {
    users = new FakeUsersService();
    jwt = new FakeJwtService();
    service = new AuthService(
      users as unknown as never,
      jwt as unknown as JwtService,
      fakeConfig as never,
    );
  });

  describe('signup', () => {
    it('hashes the password and issues a token pair', async () => {
      const result = await service.signup('Alice@example.com', 'p@ssword123', 'Alice');

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('alice@example.com');

      // Stored password should be a bcrypt hash, not plaintext.
      const stored = await users.findByEmail('alice@example.com');
      expect(stored?.passwordHash).not.toBe('p@ssword123');
      expect(await bcrypt.compare('p@ssword123', stored!.passwordHash)).toBe(true);

      // The refresh token should have been recorded as a bcrypt hash on the user.
      expect(stored?.refreshTokenHashes.length).toBe(1);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await service.signup('bob@example.com', 'hunter2hunter2', 'Bob');
    });

    it('returns a fresh token pair on valid credentials', async () => {
      const result = await service.login('bob@example.com', 'hunter2hunter2');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });

    it('rejects unknown emails with the same error as a wrong password', async () => {
      await expect(service.login('nobody@example.com', 'whatever')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects bad passwords', async () => {
      await expect(service.login('bob@example.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token: old token dies, new pair issued', async () => {
      const initial = await service.signup('carol@example.com', 'correcthorse1', 'Carol');

      // First rotation should succeed and return a brand-new pair.
      const rotated = await service.refresh(initial.refreshToken);
      expect(rotated.refreshToken).not.toBe(initial.refreshToken);

      // Replaying the original refresh token must fail — and as a side effect
      // it must clear ALL refresh hashes (reuse detection / theft mitigation).
      await expect(service.refresh(initial.refreshToken)).rejects.toThrow(UnauthorizedException);
      const stored = await users.findByEmail('carol@example.com');
      expect(stored?.refreshTokenHashes.length).toBe(0);
    });

    it('rejects refresh tokens that decode to the wrong type', async () => {
      // Forge an "access-typed" token via the same fake jwt service.
      const forged = await jwt.signAsync({
        sub: new Types.ObjectId().toString(),
        email: 'x@y.z',
        type: 'access',
      } satisfies JwtPayload);

      await expect(service.refresh(forged)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateAccessPayload', () => {
    it('returns the user for a valid access payload', async () => {
      const created = await service.signup('dave@example.com', 'qwerty12345', 'Dave');
      const found = await service.validateAccessPayload({
        sub: created.user.id,
        email: created.user.email,
        type: 'access',
      });
      expect(found?.email).toBe('dave@example.com');
    });

    it('rejects payloads that are not access-typed', async () => {
      const created = await service.signup('eve@example.com', 'qwerty12345', 'Eve');
      const result = await service.validateAccessPayload({
        sub: created.user.id,
        email: created.user.email,
        type: 'refresh',
      });
      expect(result).toBeNull();
    });

    it('returns null when the underlying user has been deleted', async () => {
      const created = await service.signup('frank@example.com', 'qwerty12345', 'Frank');
      users.users.clear();
      const result = await service.validateAccessPayload({
        sub: created.user.id,
        email: created.user.email,
        type: 'access',
      });
      expect(result).toBeNull();
    });
  });
});
