/**
 * CommentsService unit tests.
 *
 * These tests stub CardsService, UsersService, ActivityService,
 * RealtimeService, and BoardCacheService rather than spinning up a real
 * Mongo / Nest test container. We want fast, hermetic coverage of:
 *
 *   - Creating a comment (bumps card commentsCount, records activity,
 *     publishes realtime event, invalidates board cache)
 *   - Mention parsing from the body (@email) and resolution to user ids
 *   - Deleting a comment (author-only guard, decrements commentsCount,
 *     records activity, publishes realtime, invalidates cache)
 *   - Listing comments for a card (newest-first sort)
 *
 * If a test ever needs a *real* Mongo, it belongs in an e2e suite, not here.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { REALTIME_EVENTS } from '../realtime/events';
import { CommentsService } from './comments.service';
// CommentDocument type is referenced indirectly through the service generics.

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface FakeCard {
  _id: Types.ObjectId;
  boardId: Types.ObjectId;
  title: string;
  commentsCount: number;
  save: jest.Mock;
}

interface FakeComment {
  _id: Types.ObjectId;
  cardId: Types.ObjectId;
  boardId: Types.ObjectId;
  authorId: Types.ObjectId;
  body: string;
  mentions: Types.ObjectId[];
  createdAt: Date;
}

interface FakeUserRecord {
  _id: Types.ObjectId;
  email: string;
}

function makeCard(overrides: Partial<FakeCard> = {}): FakeCard {
  const card: FakeCard = {
    _id: new Types.ObjectId(),
    boardId: new Types.ObjectId(),
    title: 'Test Card',
    commentsCount: 0,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return card;
}

/**
 * In-memory comment model stub. Mimics the Mongoose Model surface used by
 * CommentsService (create, find, findById, deleteOne).
 */
class FakeCommentModel {
  public comments: FakeComment[] = [];

  async create(input: Omit<FakeComment, '_id' | 'createdAt'>): Promise<FakeComment> {
    const comment: FakeComment = {
      _id: new Types.ObjectId(),
      createdAt: new Date(),
      ...input,
    };
    this.comments.push(comment);
    return comment;
  }

  find(filter: { cardId: Types.ObjectId }) {
    const matches = this.comments.filter(
      (c) => c.cardId.toString() === filter.cardId.toString(),
    );
    return {
      sort: (sortSpec: Record<string, number>) => {
        const sorted = [...matches].sort((a, b) => {
          if (sortSpec.createdAt === -1) {
            return b.createdAt.getTime() - a.createdAt.getTime();
          }
          return a.createdAt.getTime() - b.createdAt.getTime();
        });
        return { exec: async () => sorted };
      },
    };
  }

  findById(id: string) {
    const found = this.comments.find((c) => c._id.toString() === id) ?? null;
    return { exec: async () => found };
  }

  async deleteOne(filter: { _id: Types.ObjectId }) {
    this.comments = this.comments.filter(
      (c) => c._id.toString() !== filter._id.toString(),
    );
  }
}

/**
 * Stub CardsService. Only implements findByIdOrThrow, which CommentsService
 * calls during create and remove.
 */
class FakeCardsService {
  public cards = new Map<string, FakeCard>();

  register(card: FakeCard) {
    this.cards.set(card._id.toString(), card);
  }

  async findByIdOrThrow(id: string): Promise<FakeCard> {
    const card = this.cards.get(id);
    if (!card) throw new NotFoundException('Card not found.');
    return card;
  }
}

/**
 * Stub UsersService. Only implements findByEmail, used for mention resolution.
 */
class FakeUsersService {
  public users: FakeUserRecord[] = [];

  register(user: FakeUserRecord) {
    this.users.push(user);
  }

  async findByEmail(email: string): Promise<FakeUserRecord | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }
}

/**
 * Stub ActivityService. Captures calls so tests can assert activity was recorded.
 */
class FakeActivityService {
  public recorded: Array<Record<string, unknown>> = [];

  async record(entry: Record<string, unknown>): Promise<void> {
    this.recorded.push(entry);
  }
}

/**
 * Stub RealtimeService. Captures published events.
 */
class FakeRealtimeService {
  public published: Array<{ event: string; payload: Record<string, unknown> }> = [];

  publish(event: string, payload: Record<string, unknown>): void {
    this.published.push({ event, payload });
  }
}

/**
 * Stub BoardCacheService. Captures invalidation calls.
 */
class FakeBoardCacheService {
  public invalidated: string[] = [];

  async invalidate(boardId: string): Promise<void> {
    this.invalidated.push(boardId);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommentsService', () => {
  let commentModel: FakeCommentModel;
  let cardsService: FakeCardsService;
  let usersService: FakeUsersService;
  let activityService: FakeActivityService;
  let realtimeService: FakeRealtimeService;
  let boardCacheService: FakeBoardCacheService;
  let service: CommentsService;

  beforeEach(() => {
    commentModel = new FakeCommentModel();
    cardsService = new FakeCardsService();
    usersService = new FakeUsersService();
    activityService = new FakeActivityService();
    realtimeService = new FakeRealtimeService();
    boardCacheService = new FakeBoardCacheService();

    service = new CommentsService(
      commentModel as unknown as never,
      cardsService as unknown as never,
      usersService as unknown as never,
      activityService as unknown as never,
      realtimeService as unknown as never,
      boardCacheService as unknown as never,
    );
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe('create', () => {
    it('creates a comment and bumps the card commentsCount', async () => {
      const card = makeCard({ commentsCount: 2 });
      cardsService.register(card);

      const comment = await service.create(
        card._id.toString(),
        new Types.ObjectId().toString(),
        { body: 'Looks good to me.' },
      );

      expect(comment.body).toBe('Looks good to me.');
      expect(comment.cardId.toString()).toBe(card._id.toString());
      expect(comment.boardId.toString()).toBe(card.boardId.toString());
      expect(card.commentsCount).toBe(3);
      expect(card.save).toHaveBeenCalled();
    });

    it('records an activity entry for comment.added', async () => {
      const card = makeCard();
      cardsService.register(card);
      const authorId = new Types.ObjectId().toString();

      await service.create(card._id.toString(), authorId, { body: 'Nice work!' });

      expect(activityService.recorded).toHaveLength(1);
      expect(activityService.recorded[0]!).toMatchObject({
        boardId: card.boardId,
        cardId: card._id,
        actorId: authorId,
        type: 'comment.added',
      });
    });

    it('publishes a COMMENT_ADDED realtime event', async () => {
      const card = makeCard();
      cardsService.register(card);
      const authorId = new Types.ObjectId().toString();

      const comment = await service.create(card._id.toString(), authorId, {
        body: 'Ship it!',
      });

      expect(realtimeService.published).toHaveLength(1);
      expect(realtimeService.published[0]!.event).toBe(REALTIME_EVENTS.COMMENT_ADDED);
      expect(realtimeService.published[0]!.payload).toMatchObject({
        boardId: card.boardId.toString(),
        actorId: authorId,
        data: {
          cardId: card._id.toString(),
          commentId: comment._id.toString(),
        },
      });
    });

    it('invalidates the board cache', async () => {
      const card = makeCard();
      cardsService.register(card);

      await service.create(card._id.toString(), new Types.ObjectId().toString(), {
        body: 'Clearing cache.',
      });

      expect(boardCacheService.invalidated).toContain(card.boardId.toString());
    });
  });

  // -----------------------------------------------------------------------
  // create with mentions
  // -----------------------------------------------------------------------
  describe('create with mentions', () => {
    it('parses @email mentions from the body and resolves to user ids', async () => {
      const card = makeCard();
      cardsService.register(card);

      const alice = { _id: new Types.ObjectId(), email: 'alice@example.com' };
      const bob = { _id: new Types.ObjectId(), email: 'bob@corp.io' };
      usersService.register(alice);
      usersService.register(bob);

      const comment = await service.create(
        card._id.toString(),
        new Types.ObjectId().toString(),
        { body: 'Hey @alice@example.com and @bob@corp.io, please review.' },
      );

      expect(comment.mentions).toHaveLength(2);
      const mentionStrings = comment.mentions.map((m) => m.toString());
      expect(mentionStrings).toContain(alice._id.toString());
      expect(mentionStrings).toContain(bob._id.toString());
    });

    it('silently drops unknown email mentions', async () => {
      const card = makeCard();
      cardsService.register(card);

      const alice = { _id: new Types.ObjectId(), email: 'alice@example.com' };
      usersService.register(alice);

      const comment = await service.create(
        card._id.toString(),
        new Types.ObjectId().toString(),
        { body: '@alice@example.com and @ghost@nowhere.dev check this.' },
      );

      expect(comment.mentions).toHaveLength(1);
      expect(comment.mentions[0]!.toString()).toBe(alice._id.toString());
    });

    it('deduplicates repeated mentions of the same email', async () => {
      const card = makeCard();
      cardsService.register(card);

      const alice = { _id: new Types.ObjectId(), email: 'alice@example.com' };
      usersService.register(alice);

      const comment = await service.create(
        card._id.toString(),
        new Types.ObjectId().toString(),
        { body: '@alice@example.com first, then @alice@example.com again.' },
      );

      expect(comment.mentions).toHaveLength(1);
    });

    it('returns empty mentions when body has no @email patterns', async () => {
      const card = makeCard();
      cardsService.register(card);

      const comment = await service.create(
        card._id.toString(),
        new Types.ObjectId().toString(),
        { body: 'Just a plain comment, no mentions here.' },
      );

      expect(comment.mentions).toHaveLength(0);
    });

    it('includes mentionCount in the activity payload', async () => {
      const card = makeCard();
      cardsService.register(card);

      const alice = { _id: new Types.ObjectId(), email: 'alice@example.com' };
      usersService.register(alice);

      await service.create(card._id.toString(), new Types.ObjectId().toString(), {
        body: 'FYI @alice@example.com',
      });

      expect(activityService.recorded[0]!.payload).toMatchObject({ mentionCount: 1 });
    });

    it('includes resolved mention ids in the realtime payload', async () => {
      const card = makeCard();
      cardsService.register(card);

      const alice = { _id: new Types.ObjectId(), email: 'alice@example.com' };
      usersService.register(alice);

      await service.create(card._id.toString(), new Types.ObjectId().toString(), {
        body: 'CC @alice@example.com',
      });

      const payload = realtimeService.published[0]!.payload as {
        data: { mentions: string[] };
      };
      expect(payload.data.mentions).toContain(alice._id.toString());
    });
  });

  // -----------------------------------------------------------------------
  // remove
  // -----------------------------------------------------------------------
  describe('remove', () => {
    let card: FakeCard;
    let authorId: Types.ObjectId;

    beforeEach(async () => {
      card = makeCard({ commentsCount: 3 });
      cardsService.register(card);
      authorId = new Types.ObjectId();

      // Seed a comment in the fake model.
      await commentModel.create({
        cardId: card._id,
        boardId: card.boardId,
        authorId,
        body: 'To be deleted.',
        mentions: [],
      });
    });

    it('deletes the comment and decrements commentsCount', async () => {
      const comment = commentModel.comments[0]!;

      await service.remove(comment._id.toString(), authorId.toString());

      expect(commentModel.comments).toHaveLength(0);
      expect(card.commentsCount).toBe(2);
      expect(card.save).toHaveBeenCalled();
    });

    it('records a comment.deleted activity entry', async () => {
      const comment = commentModel.comments[0]!;

      await service.remove(comment._id.toString(), authorId.toString());

      expect(activityService.recorded).toHaveLength(1);
      expect(activityService.recorded[0]!).toMatchObject({
        boardId: comment.boardId,
        cardId: comment.cardId,
        actorId: authorId.toString(),
        type: 'comment.deleted',
      });
    });

    it('publishes a COMMENT_DELETED realtime event', async () => {
      const comment = commentModel.comments[0]!;

      await service.remove(comment._id.toString(), authorId.toString());

      expect(realtimeService.published).toHaveLength(1);
      expect(realtimeService.published[0]!.event).toBe(REALTIME_EVENTS.COMMENT_DELETED);
      expect(realtimeService.published[0]!.payload).toMatchObject({
        boardId: comment.boardId.toString(),
        actorId: authorId.toString(),
        data: {
          cardId: comment.cardId.toString(),
          commentId: comment._id.toString(),
        },
      });
    });

    it('invalidates the board cache on removal', async () => {
      const comment = commentModel.comments[0]!;

      await service.remove(comment._id.toString(), authorId.toString());

      expect(boardCacheService.invalidated).toContain(card.boardId.toString());
    });

    it('throws ForbiddenException when a non-author tries to delete', async () => {
      const comment = commentModel.comments[0]!;
      const otherId = new Types.ObjectId().toString();

      await expect(
        service.remove(comment._id.toString(), otherId),
      ).rejects.toThrow(ForbiddenException);

      // Comment should still exist.
      expect(commentModel.comments).toHaveLength(1);
    });

    it('throws NotFoundException for a non-existent comment', async () => {
      const fakeId = new Types.ObjectId().toString();

      await expect(
        service.remove(fakeId, authorId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not let commentsCount go below zero', async () => {
      card.commentsCount = 0;
      const comment = commentModel.comments[0]!;

      await service.remove(comment._id.toString(), authorId.toString());

      expect(card.commentsCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // listByCard
  // -----------------------------------------------------------------------
  describe('listByCard', () => {
    it('returns comments for the given card sorted newest first', async () => {
      const cardId = new Types.ObjectId();
      const boardId = new Types.ObjectId();
      const authorId = new Types.ObjectId();

      // Insert comments with explicit timestamps so sort order is deterministic.
      const oldest: FakeComment = {
        _id: new Types.ObjectId(),
        cardId,
        boardId,
        authorId,
        body: 'First',
        mentions: [],
        createdAt: new Date('2025-01-01T00:00:00Z'),
      };
      const middle: FakeComment = {
        _id: new Types.ObjectId(),
        cardId,
        boardId,
        authorId,
        body: 'Second',
        mentions: [],
        createdAt: new Date('2025-06-01T00:00:00Z'),
      };
      const newest: FakeComment = {
        _id: new Types.ObjectId(),
        cardId,
        boardId,
        authorId,
        body: 'Third',
        mentions: [],
        createdAt: new Date('2025-12-01T00:00:00Z'),
      };

      // Push out of order to prove sorting works.
      commentModel.comments.push(middle, oldest, newest);

      const results = await service.listByCard(cardId.toString());

      expect(results).toHaveLength(3);
      expect(results[0]!.body).toBe('Third');
      expect(results[1]!.body).toBe('Second');
      expect(results[2]!.body).toBe('First');
    });

    it('returns an empty array when the card has no comments', async () => {
      const results = await service.listByCard(new Types.ObjectId().toString());
      expect(results).toEqual([]);
    });

    it('does not return comments belonging to a different card', async () => {
      const cardA = new Types.ObjectId();
      const cardB = new Types.ObjectId();
      const boardId = new Types.ObjectId();
      const authorId = new Types.ObjectId();

      commentModel.comments.push({
        _id: new Types.ObjectId(),
        cardId: cardA,
        boardId,
        authorId,
        body: 'Card A comment',
        mentions: [],
        createdAt: new Date(),
      });
      commentModel.comments.push({
        _id: new Types.ObjectId(),
        cardId: cardB,
        boardId,
        authorId,
        body: 'Card B comment',
        mentions: [],
        createdAt: new Date(),
      });

      const results = await service.listByCard(cardA.toString());

      expect(results).toHaveLength(1);
      expect(results[0]!.body).toBe('Card A comment');
    });
  });
});
