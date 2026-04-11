/**
 * Board membership guard.
 *
 * Mirrors WorkspaceMemberGuard but resolves the role via
 * `BoardsService.findEffectiveRole`, which knows about the
 * board-membership → workspace-membership fall-through.
 *
 * The guard reads `:id` from the route params (the board's ObjectId) and
 * stamps `req.user.role` for the downstream RolesGuard.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/interfaces/jwt-payload.interface';
import { BoardsService } from '../boards.service';

interface RequestWithParams {
  user?: AuthenticatedUser;
  params: { id?: string; boardId?: string };
}

@Injectable()
export class BoardMemberGuard implements CanActivate {
  constructor(private readonly boards: BoardsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithParams>();
    // Support both `:id` (top-level board route) and `:boardId` (nested
    // resources like comments/cards). One guard handles both styles.
    const boardId = req.params.id ?? req.params.boardId;
    const user = req.user;

    if (!user || !boardId) {
      throw new NotFoundException('Board not found.');
    }

    const role = await this.boards.findEffectiveRole(boardId, user.id);
    if (!role) {
      throw new NotFoundException('Board not found.');
    }

    user.role = role;
    return true;
  }
}
