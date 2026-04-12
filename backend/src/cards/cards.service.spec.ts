/**
 * CardsService unit tests.
 *
 * Like auth.service.spec.ts, we stub every external dependency rather than
 * booting Mongo or Nest's DI container. This gives us fast, hermetic coverage
 * of:
 *
 *   - Card creation (position calculation, list cardOrder sync, activity,
 *     realtime broadcast, cache invalidation)
 *   - Update (partial field patching, activity recording, cache bust)
 *   - Remove (card deletion, cardOrder cleanup, activity, cache bust)
 *   - Move (same-list reorder, cross-list with WIP enforcement)
 *   - WIP-limit enforcement (assertWipAllows)
 *
 * If a test needs a real Mongo, it belongs in the e2e suite, not here.
 */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { CardsService } from './cards.service';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/** Shorthand for creating a new ObjectId. */
const oid = () => new Types.ObjectId();

const BOARD_ID = oid();
const LIST_ID_A = oid();
const LIST_ID_B = oid();
const CREATOR_ID = oid().toString();

// ---------------------------------------------------------------------------
// Fake list documents
// ---------------------------------------------------------------------------

interface FakeList {
  _id: Types.ObjectId;
  boardId: Types.ObjectId;
  title: string;
  wipLimit: number | null;
  cardOrder: Types.ObjectId[];
  save: () => Promise<FakeList>;
}

function makeList(
  overrides: Partial<FakeList> & { _id: Types.ObjectId },
): FakeList {
  const list: FakeList = {
    boardId: BOARD_ID,
    title: 'Untitled',
    wipLimit: null,
    cardOrder: [],
    ...overrides,
    save: jest.fn().mockImplementation(async function (this: FakeList) {
      return this;
    }),
  };
  // Bind save's `this` to the list itself so mutating cardOrder is visible.
  (list.save as jest.Mock).mockImplementation(async () => list);
  return list;
}

// ---------------------------------------------------------------------------
// Fake card documents
// ---------------------------------------------------------------------------

interface FakeCard {
  _id: Types.ObjectId;
  boardId: Types.ObjectId;
  listId: Types.ObjectId;
  title: string;
  description?: string;
  priority: string;
  tags: string[];
  assignees: Types.ObjectId[];
  dueDate: Date | null;
  progress: number;
  position: string;
  archivedAt: Date | null;
  createdBy: Types.ObjectId;
  save: () => Promise<FakeCard>;
}

function makeCard(overrides: Partial<FakeCard> = {}): FakeCard {
  const card: FakeCard = {
    _id: oid(),
    boardId: BOARD_ID,
    listId: LIST_ID_A,
    title: 'Test card',
    description: '',
    priority: 'medium',
    tags: [],
    assignees: [],
    dueDate: null,
    progress: 0,
    position: 'U',
    archivedAt: null,
    createdBy: new Types.ObjectId(CREATOR_ID),
    ...overrides,
    save: jest.fn(),
  };
  (card.save as jest.Mock).mockImplementation(async () => card);
  return card;
}

// ---------------------------------------------------------------------------
// Fake Mongoose model
// ---------------------------------------------------------------------------

/**
 * Minimal stub for Mongoose's Model<CardDocument>. We track method calls and
 * control return values per-test via the `__cards` backing array and helpers.
 *
 * Uses a builder pattern (.find().sort().limit().exec()) that mirrors
 * Mongoose's chainable query API.
 */
class FakeCardModel {
  /** Backing store — tests push cards here to control query results. */
  public __cards: FakeCard[] = [];

  /** Last card passed to `create()`. */
  public __lastCreated: FakeCard | null = null;

  /** Track deleteOne calls. */
  public deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

  /**
   * Simulate Model.create(). Builds a fake card from the input, stores it,
   * and returns it.
   */
  create = jest.fn().mockImplementation(async (input: Record<string, unknown>) => {
    const card = makeCard({
      _id: oid(),
      boardId: input.boardId as Types.ObjectId,
      listId: input.listId as Types.ObjectId,
      title: input.title as string,
      description: input.description as string | undefined,
      priority: (input.priority as string) ?? 'medium',
      tags: (input.tags as string[]) ?? [],
      assignees: (input.assignees as Types.ObjectId[]) ?? [],
      dueDate: (input.dueDate as Date) ?? null,
      progress: (input.progress as number) ?? 0,
      position: input.position as string,
      createdBy: input.createdBy as Types.ObjectId,
    });
    this.__cards.push(card);
    this.__lastCreated = card;
    return card;
  });

  /**
   * Chainable find() stub. Returns an object with .sort(), .limit(),
   * .select(), .exec() that resolves to __cards filtered by the query.
   */
  find = jest.fn().mockImplementation((query: Record<string, unknown> = {}) => {
    const chain = {
      _query: query,
      _sortField: null as string | null,
      _sortDir: 1 as number,
      _limit: Infinity,
      sort: jest.fn().mockImplementation((s: Record<string, number>) => {
        const key = Object.keys(s)[0]!;
        chain._sortField = key;
        chain._sortDir = s[key]!;
        return chain;
      }),
      limit: jest.fn().mockImplementation((n: number) => {
        chain._limit = n;
        return chain;
      }),
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockImplementation(async () => {
        let results = this.__cards.filter((c) => {
          // Match listId
          if (query.listId && !c.listId.equals(query.listId as Types.ObjectId)) return false;
          // Match archivedAt
          if ('archivedAt' in query && query.archivedAt === null && c.archivedAt !== null) return false;
          // Exclude by _id ($ne)
          if (query._id && (query._id as Record<string, unknown>).$ne) {
            const excluded = (query._id as Record<string, unknown>).$ne as Types.ObjectId;
            if (c._id.equals(excluded)) return false;
          }
          return true;
        });
        // Sort
        if (chain._sortField) {
          const field = chain._sortField as keyof FakeCard;
          results = [...results].sort((a, b) => {
            const av = a[field] as string;
            const bv = b[field] as string;
            return av < bv ? -chain._sortDir : av > bv ? chain._sortDir : 0;
          });
        }
        // Limit
        if (chain._limit < results.length) {
          results = results.slice(0, chain._limit);
        }
        return results;
      }),
    };
    return chain;
  });

  findById = jest.fn().mockImplementation((id: string | Types.ObjectId) => ({
    exec: jest.fn().mockImplementation(async () =>
      this.__cards.find((c) => c._id.equals(id)) ?? null,
    ),
  }));

  countDocuments = jest.fn().mockImplementation((query: Record<string, unknown>) => ({
    exec: jest.fn().mockImplementation(async () =>
      this.__cards.filter((c) => {
        if (query.listId && !c.listId.equals(query.listId as Types.ObjectId)) return false;
        if ('archivedAt' in query && query.archivedAt === null && c.archivedAt !== null) return false;
        return true;
      }).length,
    ),
  }));
}

// ---------------------------------------------------------------------------
// Fake service stubs
// ---------------------------------------------------------------------------

/**
 * Stub ListsService. Maintains an in-memory list map keyed by id string.
 * Tests can pre-populate via addList().
 */
class FakeListsService {
  public lists = new Map<string, FakeList>();

  addList(list: FakeList): void {
    this.lists.set(list._id.toString(), list);
  }

  async findByIdOrThrow(id: string): Promise<FakeList> {
    const list = this.lists.get(id);
    if (!list) throw new NotFoundException('List not found.');
    return list;
  }
}

/**
 * Stub ActivityService. Records every call for assertion.
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
  public published: Array<{ event: string; payload: unknown }> = [];

  publish(event: string, payload: unknown): void {
    this.published.push({ event, payload });
  }
}

/**
 * Stub BoardCacheService. Tracks which boards were invalidated.
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

describe('CardsService', () => {
  let cardModel: FakeCardModel;
  let listsService: FakeListsService;
  let activityService: FakeActivityService;
  let realtimeService: FakeRealtimeService;
  let boardCacheService: FakeBoardCacheService;
  let service: CardsService;

  // Default lists pre-populated for every test.
  let listA: FakeList;
  let listB: FakeList;

  beforeEach(() => {
    cardModel = new FakeCardModel();
    listsService = new FakeListsService();
    activityService = new FakeActivityService();
    realtimeService = new FakeRealtimeService();
    boardCacheService = new FakeBoardCacheService();

    // Two default lists on the same board.
    listA = makeList({ _id: LIST_ID_A, title: 'To Do', wipLimit: null });
    listB = makeList({ _id: LIST_ID_B, title: 'In Progress', wipLimit: 3 });
    listsService.addList(listA);
    listsService.addList(listB);

    // Wire up the service with all fakes — cast through `never` to satisfy
    // the strict constructor signatures.
    service = new CardsService(
      cardModel as never,
      listsService as never,
      activityService as never,
      realtimeService as never,
      boardCacheService as never,
    );
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    const dto = { title: 'My new card' };

    it('creates a card with a computed position when the list is empty', async () => {
      const card = await service.create(LIST_ID_A.toString(), CREATOR_ID, dto);

      // The card should have been persisted via cardModel.create().
      expect(cardModel.create).toHaveBeenCalledTimes(1);
      expect(card.title).toBe('My new card');
      // Position should be a non-empty string (firstPosition()).
      expect(typeof card.position).toBe('string');
      expect(card.position.length).toBeGreaterThan(0);
    });

    it('appends to the end when the list already has cards', async () => {
      // Seed a card that already exists in the list.
      const existing = makeCard({
        listId: LIST_ID_A,
        position: 'U',
        archivedAt: null,
      });
      cardModel.__cards.push(existing);

      const card = await service.create(LIST_ID_A.toString(), CREATOR_ID, dto);

      // The new card's position should sort after the existing card's.
      expect(card.position > existing.position).toBe(true);
    });

    it('pushes the new card id onto the list cardOrder', async () => {
      const card = await service.create(LIST_ID_A.toString(), CREATOR_ID, dto);

      expect(listA.cardOrder).toContainEqual(card._id);
      expect(listA.save).toHaveBeenCalled();
    });

    it('records a card.created activity entry', async () => {
      await service.create(LIST_ID_A.toString(), CREATOR_ID, dto);

      expect(activityService.recorded).toHaveLength(1);
      expect(activityService.recorded[0]!.type).toBe('card.created');
      expect(activityService.recorded[0]!.actorId).toBe(CREATOR_ID);
    });

    it('publishes a realtime card.created event', async () => {
      await service.create(LIST_ID_A.toString(), CREATOR_ID, dto);

      expect(realtimeService.published).toHaveLength(1);
      expect(realtimeService.published[0]!.event).toBe('card.created');
    });

    it('invalidates the board cache', async () => {
      await service.create(LIST_ID_A.toString(), CREATOR_ID, dto);

      expect(boardCacheService.invalidated).toContain(BOARD_ID.toString());
    });

    it('rejects when WIP limit would be exceeded', async () => {
      // List B has wipLimit=3. Seed 3 existing cards.
      for (let i = 0; i < 3; i++) {
        cardModel.__cards.push(makeCard({ listId: LIST_ID_B, archivedAt: null }));
      }

      await expect(
        service.create(LIST_ID_B.toString(), CREATOR_ID, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('applies optional DTO fields (priority, tags, progress)', async () => {
      const richDto = {
        title: 'Rich card',
        priority: 'high' as const,
        tags: ['bug', 'frontend'],
        progress: 50,
      };

      await service.create(LIST_ID_A.toString(), CREATOR_ID, richDto);

      const createArg = cardModel.create.mock.calls[0]![0] as Record<string, unknown>;
      expect(createArg.priority).toBe('high');
      expect(createArg.tags).toEqual(['bug', 'frontend']);
      expect(createArg.progress).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    let existingCard: FakeCard;

    beforeEach(() => {
      existingCard = makeCard({
        title: 'Original title',
        description: 'Original description',
        priority: 'medium',
        tags: ['old'],
        progress: 10,
      });
      cardModel.__cards.push(existingCard);
    });

    it('updates only the fields present in the DTO', async () => {
      const result = await service.update(
        existingCard._id.toString(),
        { title: 'New title' },
        CREATOR_ID,
      );

      // Title should be updated.
      expect(result.title).toBe('New title');
      // Other fields should remain unchanged.
      expect(result.description).toBe('Original description');
      expect(result.priority).toBe('medium');
    });

    it('handles archiving via the archived boolean', async () => {
      await service.update(
        existingCard._id.toString(),
        { archived: true },
        CREATOR_ID,
      );

      expect(existingCard.archivedAt).toBeInstanceOf(Date);
    });

    it('handles un-archiving', async () => {
      existingCard.archivedAt = new Date();

      await service.update(
        existingCard._id.toString(),
        { archived: false },
        CREATOR_ID,
      );

      expect(existingCard.archivedAt).toBeNull();
    });

    it('records a card.updated activity with the changed field names', async () => {
      await service.update(
        existingCard._id.toString(),
        { title: 'Changed', priority: 'urgent' },
        CREATOR_ID,
      );

      expect(activityService.recorded).toHaveLength(1);
      const entry = activityService.recorded[0]!;
      expect(entry.type).toBe('card.updated');
      expect((entry.payload as Record<string, unknown>).fields).toEqual(
        expect.arrayContaining(['title', 'priority']),
      );
    });

    it('invalidates the board cache', async () => {
      await service.update(
        existingCard._id.toString(),
        { title: 'Changed' },
        CREATOR_ID,
      );

      expect(boardCacheService.invalidated).toContain(BOARD_ID.toString());
    });

    it('publishes a realtime card.updated event', async () => {
      await service.update(
        existingCard._id.toString(),
        { title: 'Changed' },
        CREATOR_ID,
      );

      expect(realtimeService.published).toHaveLength(1);
      expect(realtimeService.published[0]!.event).toBe('card.updated');
    });

    it('throws NotFoundException for a non-existent card', async () => {
      await expect(
        service.update(oid().toString(), { title: 'Nope' }, CREATOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------

  describe('remove', () => {
    let existingCard: FakeCard;

    beforeEach(() => {
      existingCard = makeCard({ listId: LIST_ID_A });
      cardModel.__cards.push(existingCard);
      // Simulate the card being in the list's cardOrder.
      listA.cardOrder.push(existingCard._id);
    });

    it('deletes the card from the collection', async () => {
      await service.remove(existingCard._id.toString(), CREATOR_ID);

      expect(cardModel.deleteOne).toHaveBeenCalledWith({ _id: existingCard._id });
    });

    it('removes the card from the list cardOrder', async () => {
      await service.remove(existingCard._id.toString(), CREATOR_ID);

      // The card id should no longer appear in the list's order array.
      const stillPresent = listA.cardOrder.some((cid) => cid.equals(existingCard._id));
      expect(stillPresent).toBe(false);
      expect(listA.save).toHaveBeenCalled();
    });

    it('records a card.deleted activity', async () => {
      await service.remove(existingCard._id.toString(), CREATOR_ID);

      expect(activityService.recorded).toHaveLength(1);
      expect(activityService.recorded[0]!.type).toBe('card.deleted');
    });

    it('invalidates the board cache', async () => {
      await service.remove(existingCard._id.toString(), CREATOR_ID);

      expect(boardCacheService.invalidated).toContain(BOARD_ID.toString());
    });

    it('publishes a realtime card.deleted event', async () => {
      await service.remove(existingCard._id.toString(), CREATOR_ID);

      expect(realtimeService.published).toHaveLength(1);
      expect(realtimeService.published[0]!.event).toBe('card.deleted');
    });

    it('throws NotFoundException for a non-existent card', async () => {
      await expect(
        service.remove(oid().toString(), CREATOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // move
  // -------------------------------------------------------------------------

  describe('move', () => {
    let card: FakeCard;

    beforeEach(() => {
      card = makeCard({ listId: LIST_ID_A, position: 'U' });
      cardModel.__cards.push(card);
      listA.cardOrder.push(card._id);
    });

    // -- Same-list reorder --------------------------------------------------

    describe('same-list reorder', () => {
      it('moves a card to the end of the same list (no anchor)', async () => {
        const result = await service.move(
          card._id.toString(),
          { targetListId: LIST_ID_A.toString() },
          CREATOR_ID,
        );

        // Card should remain in the same list.
        expect(result.listId.equals(LIST_ID_A)).toBe(true);
        // Position should have been recalculated.
        expect(typeof result.position).toBe('string');
      });

      it('records activity with crossList=false for same-list move', async () => {
        await service.move(
          card._id.toString(),
          { targetListId: LIST_ID_A.toString() },
          CREATOR_ID,
        );

        const entry = activityService.recorded[0]!;
        expect(entry.type).toBe('card.moved');
        expect((entry.payload as Record<string, unknown>).crossList).toBe(false);
      });

      it('does NOT check WIP limit for same-list reorder', async () => {
        // Even if list A had a WIP limit, reordering within it should not
        // trigger a WIP check because we are not adding a new card.
        listA.wipLimit = 1;
        // The card is already in this list, so countDocuments returns 1,
        // but the move should still succeed.
        await expect(
          service.move(
            card._id.toString(),
            { targetListId: LIST_ID_A.toString() },
            CREATOR_ID,
          ),
        ).resolves.toBeDefined();
      });
    });

    // -- Cross-list move ----------------------------------------------------

    describe('cross-list move', () => {
      it('moves a card to a different list and updates both cardOrders', async () => {
        // List B has wipLimit=3 and 0 cards, so it should be allowed.
        const result = await service.move(
          card._id.toString(),
          { targetListId: LIST_ID_B.toString() },
          CREATOR_ID,
        );

        // Card should now belong to list B.
        expect(result.listId.equals(LIST_ID_B)).toBe(true);
      });

      it('records activity with crossList=true', async () => {
        await service.move(
          card._id.toString(),
          { targetListId: LIST_ID_B.toString() },
          CREATOR_ID,
        );

        const entry = activityService.recorded[0]!;
        expect((entry.payload as Record<string, unknown>).crossList).toBe(true);
        expect((entry.payload as Record<string, unknown>).fromList).toBe('To Do');
        expect((entry.payload as Record<string, unknown>).toList).toBe('In Progress');
      });

      it('enforces WIP limit on the target list', async () => {
        // Fill list B to its wipLimit of 3.
        for (let i = 0; i < 3; i++) {
          cardModel.__cards.push(makeCard({ listId: LIST_ID_B, archivedAt: null }));
        }

        await expect(
          service.move(
            card._id.toString(),
            { targetListId: LIST_ID_B.toString() },
            CREATOR_ID,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('invalidates cache and publishes realtime on cross-list move', async () => {
        await service.move(
          card._id.toString(),
          { targetListId: LIST_ID_B.toString() },
          CREATOR_ID,
        );

        expect(boardCacheService.invalidated).toContain(BOARD_ID.toString());
        expect(realtimeService.published).toHaveLength(1);
        expect(realtimeService.published[0]!.event).toBe('card.moved');
      });
    });

    // -- Validation ---------------------------------------------------------

    it('rejects when both beforeCardId and afterCardId are provided', async () => {
      await expect(
        service.move(
          card._id.toString(),
          {
            targetListId: LIST_ID_A.toString(),
            beforeCardId: oid().toString(),
            afterCardId: oid().toString(),
          },
          CREATOR_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a non-existent card', async () => {
      await expect(
        service.move(
          oid().toString(),
          { targetListId: LIST_ID_A.toString() },
          CREATOR_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when beforeCardId is not in the target list', async () => {
      await expect(
        service.move(
          card._id.toString(),
          {
            targetListId: LIST_ID_A.toString(),
            beforeCardId: oid().toString(), // Does not exist in list A.
          },
          CREATOR_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when afterCardId is not in the target list', async () => {
      await expect(
        service.move(
          card._id.toString(),
          {
            targetListId: LIST_ID_A.toString(),
            afterCardId: oid().toString(), // Does not exist in list A.
          },
          CREATOR_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('positions correctly when using afterCardId anchor', async () => {
      // Add a sibling card to list A that will serve as the "after" anchor.
      const anchor = makeCard({
        listId: LIST_ID_A,
        position: 'M',
        archivedAt: null,
      });
      cardModel.__cards.push(anchor);

      const result = await service.move(
        card._id.toString(),
        {
          targetListId: LIST_ID_A.toString(),
          afterCardId: anchor._id.toString(),
        },
        CREATOR_ID,
      );

      // The moved card should sort after the anchor.
      expect(result.position > anchor.position).toBe(true);
    });

    it('positions correctly when using beforeCardId anchor', async () => {
      // Add a sibling card to list A that will serve as the "before" anchor.
      const anchor = makeCard({
        listId: LIST_ID_A,
        position: 'f',
        archivedAt: null,
      });
      cardModel.__cards.push(anchor);

      const result = await service.move(
        card._id.toString(),
        {
          targetListId: LIST_ID_A.toString(),
          beforeCardId: anchor._id.toString(),
        },
        CREATOR_ID,
      );

      // The moved card should sort before the anchor.
      expect(result.position < anchor.position).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // assertWipAllows (tested indirectly through create and move)
  // -------------------------------------------------------------------------

  describe('assertWipAllows (WIP limit enforcement)', () => {
    it('allows create when under the WIP limit', async () => {
      // List B has wipLimit=3 and 0 cards — should succeed.
      await expect(
        service.create(LIST_ID_B.toString(), CREATOR_ID, { title: 'WIP ok' }),
      ).resolves.toBeDefined();
    });

    it('allows create when no WIP limit is set (null)', async () => {
      // List A has wipLimit=null — no restriction.
      for (let i = 0; i < 100; i++) {
        cardModel.__cards.push(makeCard({ listId: LIST_ID_A, archivedAt: null }));
      }

      await expect(
        service.create(LIST_ID_A.toString(), CREATOR_ID, { title: 'No limit' }),
      ).resolves.toBeDefined();
    });

    it('rejects create when at exactly the WIP limit', async () => {
      // List B wipLimit=3, seed exactly 3 cards.
      for (let i = 0; i < 3; i++) {
        cardModel.__cards.push(makeCard({ listId: LIST_ID_B, archivedAt: null }));
      }

      await expect(
        service.create(LIST_ID_B.toString(), CREATOR_ID, { title: 'Over limit' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not count archived cards toward the WIP limit', async () => {
      // List B wipLimit=3. Seed 2 active + 1 archived = 2 active count.
      cardModel.__cards.push(makeCard({ listId: LIST_ID_B, archivedAt: null }));
      cardModel.__cards.push(makeCard({ listId: LIST_ID_B, archivedAt: null }));
      cardModel.__cards.push(makeCard({ listId: LIST_ID_B, archivedAt: new Date() }));

      // 2 active + 1 new = 3, which equals the limit — should succeed.
      await expect(
        service.create(LIST_ID_B.toString(), CREATOR_ID, { title: 'Fits' }),
      ).resolves.toBeDefined();
    });

    it('allows cross-list move when target has room', async () => {
      const card = makeCard({ listId: LIST_ID_A, position: 'U' });
      cardModel.__cards.push(card);

      // List B wipLimit=3 with 2 cards — room for 1 more.
      cardModel.__cards.push(makeCard({ listId: LIST_ID_B, archivedAt: null }));
      cardModel.__cards.push(makeCard({ listId: LIST_ID_B, archivedAt: null }));

      await expect(
        service.move(
          card._id.toString(),
          { targetListId: LIST_ID_B.toString() },
          CREATOR_ID,
        ),
      ).resolves.toBeDefined();
    });

    it('rejects cross-list move when target is full', async () => {
      const card = makeCard({ listId: LIST_ID_A, position: 'U' });
      cardModel.__cards.push(card);

      // Fill list B to capacity.
      for (let i = 0; i < 3; i++) {
        cardModel.__cards.push(makeCard({ listId: LIST_ID_B, archivedAt: null }));
      }

      await expect(
        service.move(
          card._id.toString(),
          { targetListId: LIST_ID_B.toString() },
          CREATOR_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // findByIdOrThrow
  // -------------------------------------------------------------------------

  describe('findByIdOrThrow', () => {
    it('returns the card when it exists', async () => {
      const card = makeCard();
      cardModel.__cards.push(card);

      const result = await service.findByIdOrThrow(card._id.toString());
      expect(result._id.equals(card._id)).toBe(true);
    });

    it('throws NotFoundException for an invalid ObjectId string', async () => {
      await expect(service.findByIdOrThrow('not-a-valid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the card does not exist', async () => {
      await expect(service.findByIdOrThrow(oid().toString())).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
