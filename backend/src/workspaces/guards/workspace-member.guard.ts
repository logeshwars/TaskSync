/**
 * Workspace membership guard.
 *
 * Runs after JwtAuthGuard (so `req.user` is populated) but before RolesGuard.
 * Responsibilities:
 *   1. Pull `:slug` off the route params.
 *   2. Look up the requester's role in that workspace.
 *   3. If they're not a member, throw 404 (NOT 403 — we don't want to leak
 *      whether the workspace exists to non-members).
 *   4. If they are, stamp `req.user.role` so RolesGuard can compare it
 *      against the @Roles() metadata on the handler.
 *
 * Why a separate guard instead of folding this into RolesGuard?
 *   - Reusability: the BoardMemberGuard does the same thing for boards.
 *   - Single Responsibility: RolesGuard is generic — it only knows how to
 *     compare. It doesn't (and shouldn't) know how to resolve a role.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/interfaces/jwt-payload.interface';
import { WorkspacesService } from '../workspaces.service';

interface RequestWithParams {
  user?: AuthenticatedUser;
  params: { slug?: string };
}

@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private readonly workspaces: WorkspacesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithParams>();
    const slug = req.params.slug;
    const user = req.user;

    // Belt-and-braces: JwtAuthGuard should have caught this already, but
    // never trust your own ordering at runtime.
    if (!user) {
      throw new NotFoundException('Workspace not found.');
    }
    if (!slug) {
      // Misconfigured route — the developer wired this guard onto a path
      // that doesn't carry a :slug param. Fail loud.
      throw new NotFoundException('Workspace not found.');
    }

    const role = await this.workspaces.findMemberRole(slug, user.id);
    if (!role) {
      throw new NotFoundException('Workspace not found.');
    }

    // Mutate req.user in place — downstream RolesGuard reads role from
    // exactly this property.
    user.role = role;
    return true;
  }
}
