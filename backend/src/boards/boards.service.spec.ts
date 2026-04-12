/**
 * BoardsService unit tests.
 *
 * Same hermetic pattern as auth.service.spec.ts — fake model, fake workspace
 * service, fake users service. No Nest test container, no real Mongo. We
 * exercise the service's business logic in isolation:
 *
 *   - Basic CRUD (findById, findByIdOrThrow, create, update)
 *   - Role resolution (explicit board member vs. workspace fall-through)
 *   - Membership mutations (add, remove, guard rails)
 *
 * If a test needs a real database, it belongs in the e2e suite.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { BoardsService } from './boards.service';
import type { BoardMember } from './schemas/board.schema';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Minimal shape that mirrors BoardDocument for in-memory testing. */
interface FakeBoard {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  title: string;
  description?: string;
  color?: string;
  createdBy: Types.ObjectId;
  members: BoardMember[];
  listOrder: Types.ObjectId[];
  archivedAt: Date | null;
  /** Mimics Mongoose document.save() — returns itself. */
  save: () => Promise<FakeBoard>;
}

/**
 * In-memory Mongoose Model stub. Implements only the methods BoardsService
 * actually calls: create, findById, findOne, find, deleteOne. Each returns
 * a thenable (or an object with `.exec()`) so the service's `await` works.
 */
class FakeBoardModel {
  public boards = new Map<string, FakeBoard>();

  /** Simulate `new this.boardModel(...)` + `.save()` via `Model.create()`. */
  async create(input: Partial<FakeBoard>): Promise<FakeBoard> {
    const id = new Types.ObjectId();
    const board: FakeBoard = {
      _id: id,
      workspaceId: input.workspaceId!,
      title: input.title ?? '',
      description: input.description,
      color: input.color,
      createdBy: input.createdBy!,
      members: (input.members as BoardMember[]) ?? [],
      listOrder: input.listOrder ?? [],
      archivedAt: input.archivedAt ?? null,
      save: async function () {
        return this;
      },
    };
    // Bind save so `this` refers to the board, not the caller.
    board.save = board.save.bind(board);
    this.boards.set(id.toString(), board);
    return board;
  }

  /** Simulate `Model.findById(id).exec()`. */
  findById(id: string | Types.ObjectId) {
    const found = this.boards.get(id.toString()) ?? null;
    return { exec: async () => found };
  }

  /** Simulate `Model.deleteOne({ _id })`. */
  async deleteOne(filter: { _id: string }) {
    const existed = this.boards.delete(filter._id);
    return { deletedCount: existed ? 1 : 0 };
  }

  /** Simulate `Model.find(filter).sort(...).exec()`. */
  find(_filter: Record<string, unknown>) {
    return {
      sort: () => ({
        exec: async () => [...this.boards.values()],
      }),
    };
  }
}

/**
 * Fake WorkspacesService. Only the two methods BoardsService calls are
 * stubbed: `findBySlugOrThrow` and `findMemberRoleByWorkspaceId`.
 */
class FakeWorkspacesService {
  /** Pre-seeded workspace returned by findBySlugOrThrow. */
  public workspace = {
    _id: new Types.ObjectId(),
    slug: 'acme',
  };

  /** Map of `userId` -> workspace-level role. */
  public memberRoles = new Map<string, string>();

  async findBySlugOrThrow(slug: string) {
    if (slug !== this.workspace.slug) {
      throw new NotFoundException(`Workspace "${slug}" not found.`);
    }
    return this.workspace;
  }

  async findMemberRoleByWorkspaceId(
    _workspaceId: Types.ObjectId | string,
    userId: string,
  ) {
    return this.memberRoles.get(userId) ?? null;
  }
}

/**
 * Fake UsersService. BoardsService only touches `findByEmail` (used by
 * `resolveUserIdByEmailOrThrow`).
 */
class FakeUsersService {
  public users = new Map<string, { _id: Types.ObjectId; email: string }>();

  seed(email: string): Types.ObjectId {
    const id = new Types.ObjectId();
    this.users.set(email, { _id: id, email });
    return id;
  }

  async findByEmail(email: string) {
    return this.users.get(email) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BoardsService', () => {
  let boardModel: FakeBoardModel;
  let workspaces: FakeWorkspacesService;
  let users: FakeUsersService;
  let service: BoardsService;

  /** Convenience: a stable creator id reused across tests. */
  const creatorId = new Types.ObjectId();

  beforeEach(() => {
    boardModel = new FakeBoardModel();
    workspaces = new FakeWorkspacesService();
    users = new FakeUsersService();

    // Wire up exactly like the real constructor: (boardModel, workspaces, users).
    service = new BoardsService(
      boardModel as never,
      workspaces as never,
      users as never,
    );
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns the board when it exists', async () => {
      // Seed one board directly in the fake model so findById can locate it.
      const created = await boardModel.create({
        workspaceId: workspaces.workspace._id,
        title: 'Sprint 1',
        createdBy: creatorId,
        members: [],
      });

      const found = await service.findById(created._id.toString());
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Sprint 1');
    });

    it('returns null for a valid ObjectId that does not match any board', async () => {
      const ghost = new Types.ObjectId();
      const found = await service.findById(ghost.toString());
      expect(found).toBeNull();
    });

    it('returns null for a malformed id (not a valid ObjectId)', async () => {
      // Types.ObjectId.isValid rejects strings like "not-an-id".
      const found = await service.findById('not-an-id');
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findByIdOrThrow
  // -------------------------------------------------------------------------

  describe('findByIdOrThrow', () => {
    it('returns the board when it exists', async () => {
      const created = await boardModel.create({
        workspaceId: workspaces.workspace._id,
        title: 'Backlog',
        createdBy: creatorId,
        members: [],
      });

      const found = await service.findByIdOrThrow(created._id.toString());
      expect(found.title).toBe('Backlog');
    });

    it('throws NotFoundException when the board does not exist', async () => {
      const ghost = new Types.ObjectId();
      await expect(service.findByIdOrThrow(ghost.toString())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('seeds the creator as owner in the members array', async () => {
      const board = await service.create('acme', creatorId.toString(), {
        title: 'Roadmap',
      });

      // The creator should be the sole member with role "owner".
      expect(board.members).toHaveLength(1);
      expect(board.members[0]!.role).toBe('owner');
      expect(board.members[0]!.userId.equals(creatorId)).toBe(true);
    });

    it('stores the workspace id returned by WorkspacesService', async () => {
      const board = await service.create('acme', creatorId.toString(), {
        title: 'Design',
      });

      // The workspaceId on the board should match the fake workspace.
      expect(board.workspaceId.equals(workspaces.workspace._id)).toBe(true);
    });

    it('passes through optional description and color', async () => {
      const board = await service.create('acme', creatorId.toString(), {
        title: 'Themed',
        description: 'With extras',
        color: '#7c3aed',
      });

      expect(board.description).toBe('With extras');
      expect(board.color).toBe('#7c3aed');
    });

    it('throws when the workspace slug is unknown (delegates to WorkspacesService)', async () => {
      await expect(
        service.create('no-such-ws', creatorId.toString(), { title: 'Oops' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    let boardId: string;

    beforeEach(async () => {
      const board = await service.create('acme', creatorId.toString(), {
        title: 'Original',
        description: 'Old description',
        color: '#000',
      });
      boardId = board._id.toString();
    });

    it('updates title, description, and color when provided', async () => {
      const updated = await service.update(boardId, {
        title: 'Renamed',
        description: 'New desc',
        color: '#fff',
      });

      expect(updated.title).toBe('Renamed');
      expect(updated.description).toBe('New desc');
      expect(updated.color).toBe('#fff');
    });

    it('leaves fields untouched when they are omitted from the DTO', async () => {
      // Only update the title; description and color should stay.
      const updated = await service.update(boardId, { title: 'Just Title' });

      expect(updated.title).toBe('Just Title');
      expect(updated.description).toBe('Old description');
      expect(updated.color).toBe('#000');
    });

    it('sets archivedAt to a Date when archived=true', async () => {
      const updated = await service.update(boardId, { archived: true });

      expect(updated.archivedAt).toBeInstanceOf(Date);
    });

    it('clears archivedAt when archived=false (un-archive)', async () => {
      // Archive first, then un-archive.
      await service.update(boardId, { archived: true });
      const updated = await service.update(boardId, { archived: false });

      expect(updated.archivedAt).toBeNull();
    });

    it('throws NotFoundException for a non-existent board', async () => {
      const ghost = new Types.ObjectId();
      await expect(
        service.update(ghost.toString(), { title: 'Nope' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // findEffectiveRole
  // -------------------------------------------------------------------------

  describe('findEffectiveRole', () => {
    let boardId: string;

    beforeEach(async () => {
      const board = await service.create('acme', creatorId.toString(), {
        title: 'Role Board',
      });
      boardId = board._id.toString();
    });

    it('returns the explicit board role when the user is a direct member', async () => {
      // The creator was seeded as "owner" during create().
      const role = await service.findEffectiveRole(
        boardId,
        creatorId.toString(),
      );
      expect(role).toBe('owner');
    });

    it('falls through to "admin" when the user is a workspace owner but not a board member', async () => {
      const wsOwnerId = new Types.ObjectId();
      workspaces.memberRoles.set(wsOwnerId.toString(), 'owner');

      const role = await service.findEffectiveRole(
        boardId,
        wsOwnerId.toString(),
      );
      expect(role).toBe('admin');
    });

    it('falls through to "admin" when the user is a workspace admin but not a board member', async () => {
      const wsAdminId = new Types.ObjectId();
      workspaces.memberRoles.set(wsAdminId.toString(), 'admin');

      const role = await service.findEffectiveRole(
        boardId,
        wsAdminId.toString(),
      );
      expect(role).toBe('admin');
    });

    it('returns null when the user is only a workspace "member" (no board-level access)', async () => {
      // A workspace-level "member" does NOT get implicit board access.
      const wsMemberId = new Types.ObjectId();
      workspaces.memberRoles.set(wsMemberId.toString(), 'member');

      const role = await service.findEffectiveRole(
        boardId,
        wsMemberId.toString(),
      );
      expect(role).toBeNull();
    });

    it('returns null when the user has no workspace or board membership at all', async () => {
      const strangerId = new Types.ObjectId();
      const role = await service.findEffectiveRole(
        boardId,
        strangerId.toString(),
      );
      expect(role).toBeNull();
    });

    it('returns null when the board does not exist', async () => {
      const ghost = new Types.ObjectId();
      const role = await service.findEffectiveRole(
        ghost.toString(),
        creatorId.toString(),
      );
      expect(role).toBeNull();
    });

    it('prefers the explicit board role over the workspace fall-through', async () => {
      // Add a user as a board "viewer", but make them a workspace "owner".
      // The explicit board role ("viewer") should win.
      const userId = new Types.ObjectId();
      await service.addMember(boardId, userId.toString(), 'viewer');
      workspaces.memberRoles.set(userId.toString(), 'owner');

      const role = await service.findEffectiveRole(
        boardId,
        userId.toString(),
      );
      expect(role).toBe('viewer');
    });
  });

  // -------------------------------------------------------------------------
  // addMember
  // -------------------------------------------------------------------------

  describe('addMember', () => {
    let boardId: string;

    beforeEach(async () => {
      const board = await service.create('acme', creatorId.toString(), {
        title: 'Membership Board',
      });
      boardId = board._id.toString();
    });

    it('appends a new member with the specified role', async () => {
      const newUserId = new Types.ObjectId();
      const updated = await service.addMember(
        boardId,
        newUserId.toString(),
        'member',
      );

      // Should now have 2 members: the original creator + the new one.
      expect(updated.members).toHaveLength(2);

      const added = updated.members.find((m) => m.userId.equals(newUserId));
      expect(added).toBeDefined();
      expect(added!.role).toBe('member');
      expect(added!.joinedAt).toBeInstanceOf(Date);
    });

    it('throws ConflictException when the user is already a member', async () => {
      const dupeId = new Types.ObjectId();
      await service.addMember(boardId, dupeId.toString(), 'member');

      // Second add of the same user should blow up.
      await expect(
        service.addMember(boardId, dupeId.toString(), 'admin'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when the board does not exist', async () => {
      const ghost = new Types.ObjectId();
      await expect(
        service.addMember(ghost.toString(), new Types.ObjectId().toString(), 'member'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // removeMember
  // -------------------------------------------------------------------------

  describe('removeMember', () => {
    let boardId: string;
    let memberId: Types.ObjectId;

    beforeEach(async () => {
      const board = await service.create('acme', creatorId.toString(), {
        title: 'Remove Board',
      });
      boardId = board._id.toString();

      // Add a second member we can safely remove.
      memberId = new Types.ObjectId();
      await service.addMember(boardId, memberId.toString(), 'member');
    });

    it('removes the specified member from the board', async () => {
      const updated = await service.removeMember(
        boardId,
        memberId.toString(),
      );

      // Only the creator should remain.
      expect(updated.members).toHaveLength(1);
      expect(updated.members[0]!.userId.equals(creatorId)).toBe(true);
    });

    it('throws ForbiddenException when trying to remove the board creator', async () => {
      // The creator (seeded as "owner") can never be removed.
      await expect(
        service.removeMember(boardId, creatorId.toString()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the target user is not a member', async () => {
      const strangerId = new Types.ObjectId();
      await expect(
        service.removeMember(boardId, strangerId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the board does not exist', async () => {
      const ghost = new Types.ObjectId();
      await expect(
        service.removeMember(ghost.toString(), memberId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
