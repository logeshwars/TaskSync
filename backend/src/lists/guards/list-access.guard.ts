/**
 * ListAccessGuard — the /lists/:id route doesn't carry a board id in the
 * URL, so we can't reuse BoardMemberGuard as-is. This guard loads the
 * list, resolves its parent board, then delegates to the boards service
 * to compute the effective role (including the workspace fall-through).
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/interfaces/jwt-payload.interface';
import { BoardsService } from '../../boards/boards.service';
import { ListsService } from '../lists.service';

interface RequestWithParams {
  user?: AuthenticatedUser;
  params: { id?: string };
}

@Injectable()
export class ListAccessGuard implements CanActivate {
  constructor(
    private readonly lists: ListsService,
    private readonly boards: BoardsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithParams>();
    const id = req.params.id;
    const user = req.user;
    if (!id || !user) {
      throw new NotFoundException('List not found.');
    }

    const list = await this.lists.findByIdOrThrow(id);
    const role = await this.boards.findEffectiveRole(list.boardId.toString(), user.id);
    if (!role) {
      throw new NotFoundException('List not found.');
    }
    user.role = role;
    return true;
  }
}
