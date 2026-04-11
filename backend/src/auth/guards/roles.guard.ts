/**
 * Generic role guard.
 *
 * Reads the `@Roles(...)` metadata and compares against `req.user.role`.
 * The role itself is populated by a resource-specific resolver — for the
 * workspace and board modules added in Phase 3, that resolver looks up the
 * requester's membership for the targeted resource and stamps `req.user.role`
 * before this guard runs.
 *
 * Until a resolver populates the role, this guard is a no-op (allows when
 * no `@Roles()` metadata is present).
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY, type Role } from '../decorators/roles.decorator';

interface RequestWithRole {
  user?: { id: string; email: string; role?: Role };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No metadata == no restriction. The guard exists; this method is open.
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithRole>();
    const role = req.user?.role;

    if (!role || !required.includes(role)) {
      throw new ForbiddenException(`Requires one of: ${required.join(', ')}`);
    }
    return true;
  }
}
