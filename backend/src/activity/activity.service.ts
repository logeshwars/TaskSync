/**
 * Activity service — the write sink for the audit log.
 *
 * Other services call `record()` after every mutating operation. Keeping
 * the API asynchronous-but-fire-and-forget from the caller's perspective
 * (they `await` it, but we swallow and log errors rather than failing the
 * whole request) means the activity log never blocks the critical path.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Activity,
  type ActivityDocument,
  type ActivityType,
} from './schemas/activity.schema';

interface RecordInput {
  boardId: string | Types.ObjectId;
  cardId?: string | Types.ObjectId | null;
  actorId: string | Types.ObjectId;
  type: ActivityType;
  payload?: Record<string, unknown>;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<ActivityDocument>,
  ) {}

  /**
   * Append an activity row. Never throws — we log and swallow so audit
   * failures don't break the user-facing write.
   */
  async record(input: RecordInput): Promise<void> {
    try {
      await this.activityModel.create({
        boardId: this.toObjectId(input.boardId),
        cardId: input.cardId ? this.toObjectId(input.cardId) : null,
        actorId: this.toObjectId(input.actorId),
        type: input.type,
        payload: input.payload ?? {},
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record activity "${input.type}": ${(err as Error).message}`,
      );
    }
  }

  /**
   * Paginated feed of board activity, newest first. `before` is an
   * opaque cursor — pass the last entry's `createdAt` back in.
   */
  async findFeed(
    boardId: string,
    opts: { limit?: number; before?: Date } = {},
  ): Promise<ActivityDocument[]> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const query: Record<string, unknown> = { boardId: new Types.ObjectId(boardId) };
    if (opts.before) {
      query.createdAt = { $lt: opts.before };
    }
    return this.activityModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  private toObjectId(id: string | Types.ObjectId): Types.ObjectId {
    return typeof id === 'string' ? new Types.ObjectId(id) : id;
  }
}
