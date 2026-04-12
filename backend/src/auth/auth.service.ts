/**
 * Auth service.
 *
 * Responsibilities:
 *   - Hash and verify passwords (bcrypt, 12 rounds).
 *   - Issue and rotate JWT access + refresh tokens.
 *   - Track active refresh tokens via hashed JTIs on the user document so
 *     individual sessions can be revoked.
 *
 * Refresh-token rotation strategy:
 *   1. On every login/signup we sign a refresh token with a unique `jti`
 *      and store its bcrypt hash on the user.
 *   2. On `/auth/refresh` we verify the JWT, find the matching hash, REMOVE
 *      it, and issue a brand new pair. The old refresh token is now dead.
 *   3. If a refresh token is presented whose hash isn't in the user record
 *      (already-rotated or stolen), we wipe ALL refresh hashes for that user
 *      as a token-theft mitigation.
 *   4. Logout removes the current hash; logoutAll wipes them all.
 */
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';

import type { AppConfig } from '../config/configuration';
import { UsersService } from '../users/users.service';
import type {
  AuthenticatedUser,
  JwtPayload,
} from './interfaces/jwt-payload.interface';

const BCRYPT_ROUNDS = 12;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // ---------------------------------------------------------------------------
  // Public flows
  // ---------------------------------------------------------------------------

  async signup(email: string, password: string, name: string): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.users.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
    });
    const tokens = await this.issueTokens(user._id, user.email);
    return {
      user: { id: user._id.toString(), email: user.email },
      ...tokens,
    };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(email.toLowerCase(), { withSecrets: true });
    // Identical error for "no such user" and "wrong password" — never reveal
    // which one it was. Side-channel protection.
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const tokens = await this.issueTokens(user._id, user.email);
    return {
      user: { id: user._id.toString(), email: user.email },
      ...tokens,
    };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const user = await this.users.findById(payload.sub, { withSecrets: true });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const matched = await this.findMatchingHash(payload.jti!, user.refreshTokenHashes);
    if (!matched) {
      // Reuse detected (or already-rotated). Drop ALL refresh tokens as a
      // safety measure — assume the token might be stolen.
      await this.users.clearRefreshTokens(user._id);
      throw new UnauthorizedException('Refresh token revoked.');
    }

    // Rotation: drop the old hash, issue a fresh pair.
    await this.users.removeRefreshTokenHash(user._id, matched);
    const tokens = await this.issueTokens(user._id, user.email);
    return {
      user: { id: user._id.toString(), email: user.email },
      ...tokens,
    };
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    let payload: JwtPayload;
    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      // Already-invalid token has nothing to revoke.
      return;
    }

    const user = await this.users.findById(userId, { withSecrets: true });
    if (!user || !payload.jti) {
      return;
    }

    const matched = await this.findMatchingHash(payload.jti, user.refreshTokenHashes);
    if (matched) {
      await this.users.removeRefreshTokenHash(user._id, matched);
    }
  }

  /**
   * Hook used by JwtStrategy. Inflates the payload into the request user
   * AND verifies the user still exists — deleted users can't authenticate
   * even with an unexpired access token.
   */
  async validateAccessPayload(payload: JwtPayload): Promise<AuthenticatedUser | null> {
    if (payload.type !== 'access') {
      return null;
    }
    const user = await this.users.findById(payload.sub);
    if (!user) {
      return null;
    }
    return { id: user._id.toString(), email: user.email };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async issueTokens(
    userId: Types.ObjectId,
    email: string,
  ): Promise<TokenPair> {
    const jwtConfig = this.config.get('jwt', { infer: true });
    const jti = randomUUID();

    const accessPayload: JwtPayload = {
      sub: userId.toString(),
      email,
      type: 'access',
    };
    const refreshPayload: JwtPayload = {
      sub: userId.toString(),
      email,
      type: 'refresh',
      jti,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: jwtConfig.accessSecret,
        expiresIn: jwtConfig.accessTtl,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: jwtConfig.refreshSecret,
        expiresIn: jwtConfig.refreshTtl,
      }),
    ]);

    // Persist the bcrypt'd jti so we can rotate / revoke this session later.
    const jtiHash = await bcrypt.hash(jti, BCRYPT_ROUNDS);
    await this.users.addRefreshTokenHash(userId, jtiHash);

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    const jwtConfig = this.config.get('jwt', { infer: true });
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: jwtConfig.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    if (payload.type !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    return payload;
  }

  /**
   * Walk the stored hashes looking for one that matches the given jti.
   * Walking is fine because users typically have a small (< 10) number of
   * concurrent sessions; if that ever stops being true we should move to a
   * dedicated `sessions` collection keyed by jti.
   */
  private async findMatchingHash(jti: string, hashes: string[]): Promise<string | undefined> {
    for (const hash of hashes) {
      if (await bcrypt.compare(jti, hash)) {
        return hash;
      }
    }
    return undefined;
  }
}
