/**
 * Comments service.
 *
 * Responsibilities:
 *   - Create / list / delete comments on a card.
 *   - Parse `@mentions` out of the body and store them as a denormalised
 *     user-id array.
 *   - Maintain the card's denormalised `commentsCount` so the board view
 *     can show the count without joining the comments collection.
 *   - Write to the activity feed via ActivityService.
 *
 * Mention parsing is email-style for now (`@user@example.com`). When we
 * add handles/usernames in a later phase, swap in a username resolver.
 */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ActivityService } from '../activity/activity.service';
import { CardsService } from '../cards/cards.service';
import { BoardCacheService } from '../common/cache/board-cache.service';
import { REALTIME_EVENTS } from '../realtime/events';
import { RealtimeService } from '../realtime/realtime.service';
import { UsersService } from '../users/users.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Comment, type CommentDocument } from './schemas/comment.schema';

// Matches `@word@word.tld` (email form). Captures the email.
const MENTION_REGEX = /@([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    private readonly cards: CardsService,
    private readonly users: UsersService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly boardCache: BoardCacheService,
  ) {}

  async listByCard(cardId: string): Promise<CommentDocument[]> {
    return this.commentModel
      .find({ cardId: new Types.ObjectId(cardId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async create(
    cardId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentDocument> {
    const card = await this.cards.findByIdOrThrow(cardId);
    const mentions = await this.resolveMentions(dto.body);

    const comment = await this.commentModel.create({
      cardId: card._id,
      boardId: card.boardId,
      authorId: new Types.ObjectId(authorId),
      body: dto.body,
      mentions,
    });

    // Bump the denormalised count on the card ($inc is atomic).
    card.commentsCount += 1;
    await card.save();

    // Best-effort audit log — swallow errors inside the activity service.
    await this.activity.record({
      boardId: card.boardId,
      cardId: card._id,
      actorId: authorId,
      type: 'comment.added',
      payload: { cardTitle: card.title, mentionCount: mentions.length },
    });

    // Invalidate hydrated board — commentsCount changed on a card.
    void this.boardCache.invalidate(card.boardId.toString());

    this.realtime.publish(REALTIME_EVENTS.COMMENT_ADDED, {
      boardId: card.boardId.toString(),
      actorId: authorId,
      data: {
        cardId: card._id.toString(),
        commentId: comment._id.toString(),
        mentions: mentions.map((m) => m.toString()),
      },
    });

    return comment;
  }

  async remove(id: string, requesterId: string): Promise<void> {
    const comment = await this.commentModel.findById(id).exec();
    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }
    // Only the author can delete their own comment. Board admins also
    // pass this check because the controller's RolesGuard has already
    // decided they're permitted — we do the extra author check to keep
    // members from deleting each other's comments.
    if (comment.authorId.toString() !== requesterId) {
      throw new ForbiddenException('Only the author can delete this comment.');
    }

    await this.commentModel.deleteOne({ _id: comment._id });

    // Decrement card count.
    const card = await this.cards.findByIdOrThrow(comment.cardId.toString());
    card.commentsCount = Math.max(0, card.commentsCount - 1);
    await card.save();

    await this.activity.record({
      boardId: comment.boardId,
      cardId: comment.cardId,
      actorId: requesterId,
      type: 'comment.deleted',
      payload: { cardTitle: card.title },
    });

    void this.boardCache.invalidate(comment.boardId.toString());

    this.realtime.publish(REALTIME_EVENTS.COMMENT_DELETED, {
      boardId: comment.boardId.toString(),
      actorId: requesterId,
      data: { cardId: comment.cardId.toString(), commentId: comment._id.toString() },
    });
  }

  /**
   * Extract mention targets from the body. Unknown emails are silently
   * dropped — we never want a typo in a mention to 400 the comment.
   */
  private async resolveMentions(body: string): Promise<Types.ObjectId[]> {
    const emails = new Set<string>();
    for (const match of body.matchAll(MENTION_REGEX)) {
      const email = match[1];
      if (email) emails.add(email.toLowerCase());
    }
    if (emails.size === 0) return [];

    const resolved: Types.ObjectId[] = [];
    for (const email of emails) {
      const user = await this.users.findByEmail(email);
      if (user) resolved.push(user._id);
    }
    return resolved;
  }
}
