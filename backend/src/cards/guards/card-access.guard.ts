/**
 * CardAccessGuard — load the card, resolve its board, check role.
 *
 * Used for the direct `/cards/:id` routes which (by design) do not carry
 * the board id on the URL.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/interfaces/jwt-payload.interface';
import { BoardsService } from '../../boards/boards.service';
import { CardsService } from '../cards.service';

interface RequestWithParams {
  user?: AuthenticatedUser;
  params: { id?: string };
}

@Injectable()
export class CardAccessGuard implements CanActivate {
  constructor(
    private readonly cards: CardsService,
    private readonly boards: BoardsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithParams>();
    const id = req.params.id;
    const user = req.user;
    if (!id || !user) {
      throw new NotFoundException('Card not found.');
    }

    const card = await this.cards.findByIdOrThrow(id);
    const role = await this.boards.findEffectiveRole(card.boardId.toString(), user.id);
    if (!role) {
      throw new NotFoundException('Card not found.');
    }
    user.role = role;
    return true;
  }
}
