/**
 * WorkspacesService unit tests.
 *
 * Same hermetic style as auth.service.spec.ts: stub the Mongoose model with
 * an in-memory store, exercise the service surface directly. The goal is
 * to lock in the invariants we care about — slug derivation, owner-seed,
 * member uniqueness, owner-protection — without paying for a real DB.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import type { UsersService } from '../users/users.service';
import {
  Workspace,
  type WorkspaceDocument,
  type WorkspaceMember,
} from './schemas/workspace.schema';
import { WorkspacesService } from './workspaces.service';

// ---------------------------------------------------------------------------
// In-memory mongoose model stub
// ---------------------------------------------------------------------------

interface FakeWorkspaceDoc {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  ownerId: Types.ObjectId;
  members: WorkspaceMember[];
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<FakeWorkspaceDoc>;
}

class FakeWorkspaceModel {
  public store = new Map<string, FakeWorkspaceDoc>();

  // The service uses two query styles: find / findOne / exists / deleteOne /
  // create. We implement just enough to keep tests faithful.

  async create(input: Partial<FakeWorkspaceDoc>): Promise<FakeWorkspaceDoc> {
    const now = new Date();
    const doc: FakeWorkspaceDoc = {
      _id: new Types.ObjectId(),
      name: input.name!,
      slug: input.slug!,
      description: input.description,
      ownerId: input.ownerId!,
      members: input.members ?? [],
      createdAt: now,
      updatedAt: now,
      save: async () => {
        doc.updatedAt = new Date();
        return doc;
      },
    };
    this.store.set(doc._id.toString(), doc);
    return doc;
  }

  async exists(filter: { slug?: string }): Promise<{ _id: Types.ObjectId } | null> {
    if (filter.slug) {
      for (const d of this.store.values()) {
        if (d.slug === filter.slug) return { _id: d._id };
      }
    }
    return null;
  }

  findOne(filter: Record<string, unknown>): {
    exec: () => Promise<FakeWorkspaceDoc | null>;
    lean: () => { exec: () => Promise<FakeWorkspaceDoc | null> };
  } {
    const matcher = (d: FakeWorkspaceDoc): boolean => {
      if ('slug' in filter && filter.slug !== d.slug) return false;
      if ('_id' in filter && !(filter._id as Types.ObjectId).equals(d._id)) return false;
      if ('members.userId' in filter) {
        const target = filter['members.userId'] as Types.ObjectId;
        return d.members.some((m) => m.userId.equals(target));
      }
      return true;
    };
    const found = [...this.store.values()].find(matcher) ?? null;
    return {
      exec: async () => found,
      lean: () => ({
        exec: async () => {
          if (!found) return null;
          // For the membership lookup, the service expects only the matching
          // member to come back via Mongoose's `members.$` projection.
          if ('members.userId' in filter) {
            const target = filter['members.userId'] as Types.ObjectId;
            const matched = found.members.find((m) => m.userId.equals(target));
            return { ...found, members: matched ? [matched] : [] };
          }
          return found;
        },
      }),
    };
  }

  find(filter: Record<string, unknown>): {
    sort: () => { exec: () => Promise<FakeWorkspaceDoc[]> };
  } {
    const matcher = (d: FakeWorkspaceDoc): boolean => {
      if ('members.userId' in filter) {
        const target = filter['members.userId'] as Types.ObjectId;
        return d.members.some((m) => m.userId.equals(target));
      }
      return true;
    };
    const list = [...this.store.values()].filter(matcher);
    return {
      sort: () => ({ exec: async () => list }),
    };
  }

  async deleteOne(filter: { slug: string }): Promise<{ deletedCount: number }> {
    for (const [id, d] of this.store) {
      if (d.slug === filter.slug) {
        this.store.delete(id);
        return { deletedCount: 1 };
      }
    }
    return { deletedCount: 0 };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkspacesService', () => {
  let model: FakeWorkspaceModel;
  let users: jest.Mocked<Pick<UsersService, 'findByEmail'>>;
  let service: WorkspacesService;
  const ownerId = new Types.ObjectId().toString();

  beforeEach(() => {
    model = new FakeWorkspaceModel();
    users = {
      findByEmail: jest.fn(),
    };
    service = new WorkspacesService(model as never, users as unknown as UsersService);
  });

  describe('create', () => {
    it('seeds the creator as the workspace owner and derives a slug from the name', async () => {
      const ws = await service.create(ownerId, { name: 'Acme Engineering' });
      expect(ws.slug).toBe('acme-engineering');
      expect(ws.ownerId.toString()).toBe(ownerId);
      expect(ws.members).toHaveLength(1);
      expect(ws.members[0]!.role).toBe('owner');
      expect(ws.members[0]!.userId.toString()).toBe(ownerId);
    });

    it('honours an explicit slug when provided', async () => {
      const ws = await service.create(ownerId, { name: 'Whatever', slug: 'custom-slug' });
      expect(ws.slug).toBe('custom-slug');
    });

    it('rejects duplicate slugs', async () => {
      await service.create(ownerId, { name: 'Acme' });
      await expect(service.create(ownerId, { name: 'Acme' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects names that produce empty slugs', async () => {
      await expect(service.create(ownerId, { name: '!!!' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('membership', () => {
    let ws: WorkspaceDocument;
    const memberUserId = new Types.ObjectId();

    beforeEach(async () => {
      ws = (await service.create(ownerId, { name: 'Acme' })) as unknown as WorkspaceDocument;
      users.findByEmail.mockResolvedValue({
        _id: memberUserId,
        email: 'm@example.com',
      } as never);
    });

    it('adds a member by email', async () => {
      const updated = await service.addMemberByEmail(ws.slug, 'm@example.com', 'member');
      expect(updated.members).toHaveLength(2);
      expect(updated.members[1]!.role).toBe('member');
    });

    it('rejects re-inviting an existing member', async () => {
      await service.addMemberByEmail(ws.slug, 'm@example.com', 'member');
      await expect(
        service.addMemberByEmail(ws.slug, 'm@example.com', 'member'),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses to mutate the owner role', async () => {
      await expect(
        service.updateMemberRole(ws.slug, ownerId, 'admin'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses to remove the owner', async () => {
      await expect(service.removeMember(ws.slug, ownerId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('removes a non-owner member cleanly', async () => {
      await service.addMemberByEmail(ws.slug, 'm@example.com', 'member');
      const updated = await service.removeMember(ws.slug, memberUserId.toString());
      expect(updated.members).toHaveLength(1);
    });

    it('returns null when resolving role for a non-member', async () => {
      const role = await service.findMemberRole(ws.slug, new Types.ObjectId().toString());
      expect(role).toBeNull();
    });

    it('returns the role for an actual member', async () => {
      const role = await service.findMemberRole(ws.slug, ownerId);
      expect(role).toBe('owner');
    });
  });

  describe('remove', () => {
    it('throws when the workspace does not exist', async () => {
      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    });

    it('removes an existing workspace', async () => {
      await service.create(ownerId, { name: 'Doomed' });
      await expect(service.remove('doomed')).resolves.toBeUndefined();
    });
  });

  // Suppresses "declared but not used" — we need the symbol imported so
  // the schema's class shape is in scope for the type asserts above.
  it('imports Workspace class without runtime side-effects', () => {
    expect(Workspace).toBeDefined();
  });
});
