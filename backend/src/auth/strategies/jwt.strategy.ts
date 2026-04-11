/**
 * Passport JWT strategy.
 *
 * Validates the access token's signature/expiry and resolves it to the live
 * user record. The result is attached to `req.user` for downstream guards
 * and controllers.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AppConfig } from '../../config/configuration';
import { AuthService } from '../auth.service';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly auth: AuthService,
    config: ConfigService<AppConfig, true>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt', { infer: true }).accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Re-fetch the user on every request so deleted accounts can't keep
    // calling the API with a still-valid (but unexpired) JWT.
    const user = await this.auth.validateAccessPayload(payload);
    if (!user) {
      throw new UnauthorizedException('Token is no longer valid.');
    }
    return user;
  }
}
