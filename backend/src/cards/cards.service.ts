/**
 * Cards service.
 *
 * Owns reads and writes for the `cards` collection. The move endpoint is
 * the interesting piece — it handles three distinct cases with a single
 * method:
 *   1. Move within the same list (reorder).
 *   2. Move across lists on the same board.
 *   3. (Not implemented — cross-board moves belong to a separate
 *      "duplicate + delete" flow and would break activity lineage.)
 *
 * WIP-limit enforcement:
 *   Before accepting a create/move into a list, we check `list.wipLimit`
 *   and count the list's non-archived cards. This is an advisory cap —
 *   admins can override by raising the limit or archiving old cards.
 *
 * Why not wrap in a transaction?
 *   Same reasoning as ListsService: single-writer-per-board is a
 *   reasonable approximation for Phase 4. When the realtime gateway lands
 *   in Phase 6, we can serialise board writes through the domain bus.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ActivityService } from '../activity/activity.service';
import { BoardCacheService } from '../common/cache/board-cache.service';
import { firstPosition, midPosition } from '../common/utils/position';
import { ListsService } from '../lists/lists.service';
import { REALTIME_EVENTS } from '../realtime/events';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateCardDto } from './dto/create-card.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { Card, type CardDocument } from './schemas/card.schema';

@Injectable()
export class CardsService {
  constructor(
    @InjectModel(Card.name) private readonly cardModel: Model<CardDocument>,
    private readonly lists: ListsService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly boardCache: BoardCacheService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async findByBoard(boardId: string | Types.ObjectId): Promise<CardDocument[]> {
    return this.cardModel
      .find({ boardId, archivedAt: null })
      .sort({ listId: 1, position: 1 })
      .exec();
  }

  async findByIdOrThrow(id: string): Promise<CardDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Card not found.');
    }
    const card = await this.cardModel.findById(id).exec();
    if (!card) {
      throw new NotFoundException('Card not found.');
    }
    return card;
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async create(
    listId: string,
    creatorId: string,
    dto: CreateCardDto,
  ): Promise<CardDocument> {
    const list = await this.lists.findByIdOrThrow(listId);
    await this.assertWipAllows(list._id.toString(), list.wipLimit, 1);

    // Append to the end of the list.
    const siblings = await this.cardModel
      .find({ listId: list._id, archivedAt: null })
      .sort({ position: -1 })
      .limit(1)
      .exec();
    const tail = siblings[0];
    const position = tail ? midPosition(tail.position, null) : firstPosition();

    const card = await this.cardModel.create({
      boardId: list.boardId,
      listId: list._id,
      title: dto.title,
      description: dto.description,
      priority: dto.priority ?? 'medium',
      tags: dto.tags ?? [],
      assignees: (dto.assignees ?? []).map((a) => new Types.ObjectId(a)),
      dueDate: dto.dueDate ?? null,
      progress: dto.progress ?? 0,
      position,
      createdBy: new Types.ObjectId(creatorId),
    });

    // Keep the list's cardOrder in sync.
    list.cardOrder.push(card._id);
    await list.save();

    await this.activity.record({
      boardId: card.boardId,
      cardId: card._id,
      actorId: creatorId,
      type: 'card.created',
      payload: { cardTitle: card.title, listTitle: list.title },
    });

    // Invalidate the hydrated-board cache so the next read reflects this card.
    void this.boardCache.invalidate(card.boardId.toString());

    this.realtime.publish(REALTIME_EVENTS.CARD_CREATED, {
      boardId: card.boardId.toString(),
      actorId: creatorId,
      data: {
        cardId: card._id.toString(),
        listId: card.listId.toString(),
        title: card.title,
        position: card.position,
      },
    });

    return card;
  }

  async update(id: string, dto: UpdateCardDto, actorId: string): Promise<CardDocument> {
    const card = await this.findByIdOrThrow(id);

    if (dto.title !== undefined) card.title = dto.title;
    if (dto.description !== undefined) card.description = dto.description;
    if (dto.priority !== undefined) card.priority = dto.priority;
    if (dto.tags !== undefined) card.tags = dto.tags;
    if (dto.assignees !== undefined) {
      card.assignees = dto.assignees.map((a) => new Types.ObjectId(a));
    }
    if (dto.dueDate !== undefined) card.dueDate = dto.dueDate ?? null;
    if (dto.progress !== undefined) card.progress = dto.progress;
    if (dto.archived !== undefined) {
      card.archivedAt = dto.archived ? new Date() : null;
    }

    const saved = await card.save();

    await this.activity.record({
      boardId: saved.boardId,
      cardId: saved._id,
      actorId,
      type: 'card.updated',
      payload: { cardTitle: saved.title, fields: Object.keys(dto) },
    });

    void this.boardCache.invalidate(saved.boardId.toString());

    this.realtime.publish(REALTIME_EVENTS.CARD_UPDATED, {
      boardId: saved.boardId.toString(),
      actorId,
      data: {
        cardId: saved._id.toString(),
        listId: saved.listId.toString(),
        fields: Object.keys(dto),
      },
    });
    return saved;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const card = await this.findByIdOrThrow(id);
    await this.cardModel.deleteOne({ _id: card._id });

    // Drop from source list's cardOrder.
    const list = await this.lists.findByIdOrThrow(card.listId.toString());
    list.cardOrder = list.cardOrder.filter((cid) => !cid.equals(card._id));
    await list.save();

    await this.activity.record({
      boardId: card.boardId,
      cardId: card._id,
      actorId,
      type: 'card.deleted',
      payload: { cardTitle: card.title },
    });

    void this.boardCache.invalidate(card.boardId.toString());

    this.realtime.publish(REALTIME_EVENTS.CARD_DELETED, {
      boardId: card.boardId.toString(),
      actorId,
      data: { cardId: card._id.toString(), listId: card.listId.toString() },
    });
  }

  /**
   * Move a card — same list or cross-list — on the same board.
   */
  async move(id: string, dto: MoveCardDto, actorId: string): Promise<CardDocument> {
    if (dto.beforeCardId && dto.afterCardId) {
      throw new BadRequestException(
        'Pass either beforeCardId OR afterCardId, not both.',
      );
    }

    const card = await this.findByIdOrThrow(id);
    const sourceList = await this.lists.findByIdOrThrow(card.listId.toString());
    const targetList = await this.lists.findByIdOrThrow(dto.targetListId);

    if (!sourceList.boardId.equals(targetList.boardId)) {
      // Cross-board moves aren't supported — they'd require re-parenting
      // the card and all its comments/activity, which is out of scope.
      throw new ForbiddenException('Cannot move cards across boards.');
    }

    const crossList = !sourceList._id.equals(targetList._id);
    if (crossList) {
      // Moving INTO a list counts against its WIP limit.
      await this.assertWipAllows(targetList._id.toString(), targetList.wipLimit, 1);
    }

    // Compute the new position using the target list's siblings (excluding
    // the card being moved, which might still live in the source list).
    const targetSiblings = await this.cardModel
      .find({ listId: targetList._id, archivedAt: null, _id: { $ne: card._id } })
      .sort({ position: 1 })
      .exec();

    let prevPos: string | null = null;
    let nextPos: string | null = null;

    if (dto.beforeCardId) {
      const idx = targetSiblings.findIndex((c) => c._id.equals(dto.beforeCardId!));
      if (idx < 0) throw new NotFoundException('beforeCardId not in target list.');
      prevPos = idx > 0 ? targetSiblings[idx - 1]!.position : null;
      nextPos = targetSiblings[idx]!.position;
    } else if (dto.afterCardId) {
      const idx = targetSiblings.findIndex((c) => c._id.equals(dto.afterCardId!));
      if (idx < 0) throw new NotFoundException('afterCardId not in target list.');
      prevPos = targetSiblings[idx]!.position;
      nextPos = idx < targetSiblings.length - 1 ? targetSiblings[idx + 1]!.position : null;
    } else {
      prevPos = targetSiblings.length > 0
        ? targetSiblings[targetSiblings.length - 1]!.position
        : null;
      nextPos = null;
    }

    card.position = midPosition(prevPos, nextPos);
    card.listId = targetList._id;
    await card.save();

    // Patch cardOrder on the affected list(s).
    if (crossList) {
      sourceList.cardOrder = sourceList.cardOrder.filter((cid) => !cid.equals(card._id));
      await sourceList.save();
      targetList.cardOrder.push(card._id);
      await targetList.save();
    }

    // Re-sync the target list's cardOrder to the authoritative sort order.
    const refreshed = await this.cardModel
      .find({ listId: targetList._id, archivedAt: null })
      .sort({ position: 1 })
      .select('_id')
      .exec();
    targetList.cardOrder = refreshed.map((c) => c._id);
    await targetList.save();

    await this.activity.record({
      boardId: card.boardId,
      cardId: card._id,
      actorId,
      type: 'card.moved',
      payload: {
        cardTitle: card.title,
        fromList: sourceList.title,
        toList: targetList.title,
        crossList,
      },
    });

    void this.boardCache.invalidate(card.boardId.toString());

    this.realtime.publish(REALTIME_EVENTS.CARD_MOVED, {
      boardId: card.boardId.toString(),
      actorId,
      data: {
        cardId: card._id.toString(),
        fromListId: sourceList._id.toString(),
        toListId: targetList._id.toString(),
        position: card.position,
      },
    });

    return card;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Refuse the operation if adding `delta` new cards would push the list
   * over its WIP limit. Archived cards don't count.
   */
  private async assertWipAllows(
    listId: string,
    wipLimit: number | null,
    delta: number,
  ): Promise<void> {
    if (wipLimit === null || wipLimit === undefined) return;
    const count = await this.cardModel
      .countDocuments({ listId: new Types.ObjectId(listId), archivedAt: null })
      .exec();
    if (count + delta > wipLimit) {
      throw new ForbiddenException(
        `List WIP limit (${wipLimit}) reached. Archive or finish a card before adding more.`,
      );
    }
  }
}
