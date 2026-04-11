/**
 * Global JWT auth guard.
 *
 * Wired up as an `APP_GUARD` in AuthModule, which means EVERY route is
 * protected by default. Endpoints opt out with the `@Public()` decorator.
 *
 * Senior rationale: protect-by-default is the only safe stance. The cost of
 * forgetting `@Public()` on a signup endpoint (you can't sign up — easy to
 * notice) is much lower than forgetting `@UseGuards(...)` on a user-data
 * endpoint (you've leaked PII — invisible until exploited).
 */
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
