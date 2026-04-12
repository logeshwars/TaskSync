/**
 * Lists service.
 *
 * Owns reads and writes for the `lists` collection. All mutations also
 * update the parent board's `listOrder` array so the two stay consistent
 * — `Board.listOrder` is what the frontend renders from, `List.position`
 * is what the reorder algorithm uses to find sortable anchors.
 *
 * Concurrency note:
 *   The two-document update (list + board) is NOT wrapped in a Mongo
 *   transaction today. That's a deliberate trade-off for Phase 4: single
 *   writer per board is a reasonable approximation since only members
 *   of a given board touch its lists, and two clients racing on the same
 *   board is uncommon. Phase 6 introduces a realtime gateway that can
 *   serialise these through the domain event bus if we need stricter
 *   ordering, and we can upgrade to sessions+transactions then.
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ActivityService } from '../activity/activity.service';
import { BoardsService } from '../boards/boards.service';
import { BoardCacheService } from '../common/cache/board-cache.service';
import { firstPosition, midPosition } from '../common/utils/position';
import { REALTIME_EVENTS } from '../realtime/events';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateListDto } from './dto/create-list.dto';
import { ReorderListDto } from './dto/reorder-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { List, type ListDocument } from './schemas/list.schema';

@Injectable()
export class ListsService {
  constructor(
    @InjectModel(List.name) private readonly listModel: Model<ListDocument>,
    private readonly boards: BoardsService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly boardCache: BoardCacheService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /** Lists in a board, sorted by position. Used by the hydrated board read. */
  async findByBoard(boardId: string | Types.ObjectId): Promise<ListDocument[]> {
    return this.listModel
      .find({ boardId, archivedAt: null })
      .sort({ position: 1 })
      .exec();
  }

  async findByIdOrThrow(id: string): Promise<ListDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('List not found.');
    }
    const list = await this.listModel.findById(id).exec();
    if (!list) {
      throw new NotFoundException('List not found.');
    }
    return list;
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async create(
    boardId: string,
    dto: CreateListDto,
    actorId?: string,
  ): Promise<ListDocument> {
    const board = await this.boards.findByIdOrThrow(boardId);

    // Compute a position that sorts after the current last list.
    const siblings = await this.findByBoard(board._id);
    const tail = siblings[siblings.length - 1];
    const position = tail ? midPosition(tail.position, null) : firstPosition();

    const list = await this.listModel.create({
      boardId: board._id,
      title: dto.title,
      wipLimit: dto.wipLimit ?? null,
      position,
      cardOrder: [],
    });

    // Keep the board's denormalised `listOrder` in sync. Push is O(1).
    board.listOrder.push(list._id);
    await board.save();

    void this.boardCache.invalidate(board._id.toString());

    if (actorId) {
      await this.activity.record({
        boardId: board._id,
        actorId,
        type: 'list.created',
        payload: { listTitle: list.title },
      });
      this.realtime.publish(REALTIME_EVENTS.LIST_CREATED, {
        boardId: board._id.toString(),
        actorId,
        data: { listId: list._id.toString(), title: list.title, position: list.position },
      });
    }

    return list;
  }

  async update(
    id: string,
    dto: UpdateListDto,
    actorId?: string,
  ): Promise<ListDocument> {
    const list = await this.findByIdOrThrow(id);
    if (dto.title !== undefined) list.title = dto.title;
    if (dto.wipLimit !== undefined) list.wipLimit = dto.wipLimit ?? null;
    if (dto.archived !== undefined) {
      list.archivedAt = dto.archived ? new Date() : null;
    }
    const saved = await list.save();

    void this.boardCache.invalidate(saved.boardId.toString());

    if (actorId) {
      await this.activity.record({
        boardId: saved.boardId,
        actorId,
        type: 'list.updated',
        payload: { listTitle: saved.title, fields: Object.keys(dto) },
      });
      this.realtime.publish(REALTIME_EVENTS.LIST_UPDATED, {
        boardId: saved.boardId.toString(),
        actorId,
        data: { listId: saved._id.toString(), fields: Object.keys(dto) },
      });
    }
    return saved;
  }

  async remove(id: string, actorId?: string): Promise<void> {
    const list = await this.findByIdOrThrow(id);
    await this.listModel.deleteOne({ _id: list._id });

    // Drop from the board's listOrder too.
    const board = await this.boards.findByIdOrThrow(list.boardId.toString());
    board.listOrder = board.listOrder.filter((lid) => !lid.equals(list._id));
    await board.save();

    void this.boardCache.invalidate(board._id.toString());

    if (actorId) {
      await this.activity.record({
        boardId: board._id,
        actorId,
        type: 'list.deleted',
        payload: { listTitle: list.title },
      });
      this.realtime.publish(REALTIME_EVENTS.LIST_DELETED, {
        boardId: board._id.toString(),
        actorId,
        data: { listId: list._id.toString() },
      });
    }

    // Cascading card cleanup will be wired in a follow-up via the domain bus.
  }

  /**
   * Move a list within its board by computing a new LexoRank position.
   * Rather than rewriting every sibling's position (O(n)), we only touch
   * the list being moved and patch the board's `listOrder` array to match.
   */
  async reorder(
    id: string,
    dto: ReorderListDto,
    actorId?: string,
  ): Promise<ListDocument> {
    if (dto.beforeListId && dto.afterListId) {
      throw new BadRequestException(
        'Pass either beforeListId OR afterListId, not both.',
      );
    }

    const list = await this.findByIdOrThrow(id);
    const siblings = (await this.findByBoard(list.boardId)).filter(
      (l) => !l._id.equals(list._id),
    );

    let prevPos: string | null = null;
    let nextPos: string | null = null;

    if (dto.beforeListId) {
      const targetIndex = siblings.findIndex((l) => l._id.equals(dto.beforeListId!));
      if (targetIndex < 0) throw new NotFoundException('beforeListId not in this board.');
      prevPos = targetIndex > 0 ? siblings[targetIndex - 1]!.position : null;
      nextPos = siblings[targetIndex]!.position;
    } else if (dto.afterListId) {
      const targetIndex = siblings.findIndex((l) => l._id.equals(dto.afterListId!));
      if (targetIndex < 0) throw new NotFoundException('afterListId not in this board.');
      prevPos = siblings[targetIndex]!.position;
      nextPos = targetIndex < siblings.length - 1 ? siblings[targetIndex + 1]!.position : null;
    } else {
      // No anchor → move to end.
      prevPos = siblings.length > 0 ? siblings[siblings.length - 1]!.position : null;
      nextPos = null;
    }

    list.position = midPosition(prevPos, nextPos);
    await list.save();

    // Re-sync the board's `listOrder` to match the new sort.
    const allSorted = await this.findByBoard(list.boardId);
    const board = await this.boards.findByIdOrThrow(list.boardId.toString());
    board.listOrder = allSorted.map((l) => l._id);
    await board.save();

    void this.boardCache.invalidate(board._id.toString());

    if (actorId) {
      this.realtime.publish(REALTIME_EVENTS.LIST_REORDERED, {
        boardId: board._id.toString(),
        actorId,
        data: {
          listId: list._id.toString(),
          position: list.position,
          order: allSorted.map((l) => l._id.toString()),
        },
      });
    }

    return list;
  }
}
