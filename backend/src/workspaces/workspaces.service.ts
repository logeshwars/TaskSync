/**
 * Workspaces service.
 *
 * Owns every read/write that touches the `workspaces` collection. Higher
 * layers (controllers, the membership guard, the boards module) go through
 * here so we can:
 *   - Centralise membership lookups (one query, one place).
 *   - Enforce invariants like "exactly one owner" or "can't kick the owner".
 *   - Keep the schema's quirks (slug derivation, unique-key conflicts)
 *     contained.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import type { Role } from '../auth/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import {
  Workspace,
  type WorkspaceDocument,
  type WorkspaceMember,
} from './schemas/workspace.schema';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
    private readonly users: UsersService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(ownerId: string, dto: CreateWorkspaceDto): Promise<WorkspaceDocument> {
    const ownerObjectId = new Types.ObjectId(ownerId);
    const slug = dto.slug ?? this.slugify(dto.name);

    const existing = await this.workspaceModel.exists({ slug });
    if (existing) {
      throw new ConflictException(`Workspace slug "${slug}" is already taken.`);
    }

    return this.workspaceModel.create({
      name: dto.name,
      slug,
      description: dto.description,
      ownerId: ownerObjectId,
      // Seed the membership list with the creator as the owner. Doing this
      // here (rather than via a Mongoose middleware) keeps the invariant
      // visible at the call site.
      members: [{ userId: ownerObjectId, role: 'owner', joinedAt: new Date() }],
    });
  }

  /** Workspaces the user is a member of, newest first. */
  async findAllForUser(userId: string): Promise<WorkspaceDocument[]> {
    return this.workspaceModel
      .find({ 'members.userId': new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Lookup by slug. Used both by the controllers and by the membership
   * guard, so we keep it lean and let callers wrap it in their own NotFound
   * if they want.
   */
  async findBySlug(slug: string): Promise<WorkspaceDocument | null> {
    return this.workspaceModel.findOne({ slug }).exec();
  }

  async findBySlugOrThrow(slug: string): Promise<WorkspaceDocument> {
    const ws = await this.findBySlug(slug);
    if (!ws) {
      throw new NotFoundException(`Workspace "${slug}" not found.`);
    }
    return ws;
  }

  async update(slug: string, dto: UpdateWorkspaceDto): Promise<WorkspaceDocument> {
    // We update via a load-then-save cycle (rather than findOneAndUpdate)
    // so that any future schema-level validators / hooks fire properly.
    const ws = await this.findBySlugOrThrow(slug);

    if (dto.slug && dto.slug !== ws.slug) {
      const collision = await this.workspaceModel.exists({ slug: dto.slug });
      if (collision) {
        throw new ConflictException(`Workspace slug "${dto.slug}" is already taken.`);
      }
      ws.slug = dto.slug;
    }
    if (dto.name !== undefined) ws.name = dto.name;
    if (dto.description !== undefined) ws.description = dto.description;

    return ws.save();
  }

  async remove(slug: string): Promise<void> {
    const result = await this.workspaceModel.deleteOne({ slug });
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Workspace "${slug}" not found.`);
    }
    // NOTE: cascading board deletion will be added in Phase 3.4 once
    // BoardsService exists. We deliberately avoid coupling these two
    // services here — instead the boards module will subscribe to a
    // workspace.deleted event when we add the domain bus in Phase 5.
  }

  // ---------------------------------------------------------------------------
  // Membership
  // ---------------------------------------------------------------------------

  /**
   * Resolve the role of a given user in a workspace, or `null` if they
   * are not a member. Called from the workspace membership guard on every
   * protected request, so it has to be cheap — a single indexed query.
   */
  async findMemberRole(slug: string, userId: string): Promise<Role | null> {
    const ws = await this.workspaceModel
      .findOne(
        { slug, 'members.userId': new Types.ObjectId(userId) },
        { 'members.$': 1 },
      )
      .lean()
      .exec();
    const member = ws?.members?.[0];
    return member?.role ?? null;
  }

  /**
   * Same as `findMemberRole` but keyed by workspaceId. Used by the boards
   * module so it can fall through to workspace-level permissions for
   * users who aren't explicit board members.
   */
  async findMemberRoleByWorkspaceId(
    workspaceId: Types.ObjectId | string,
    userId: string,
  ): Promise<Role | null> {
    const ws = await this.workspaceModel
      .findOne(
        { _id: workspaceId, 'members.userId': new Types.ObjectId(userId) },
        { 'members.$': 1 },
      )
      .lean()
      .exec();
    const member = ws?.members?.[0];
    return member?.role ?? null;
  }

  async addMemberByEmail(
    slug: string,
    email: string,
    role: Exclude<Role, 'owner'>,
  ): Promise<WorkspaceDocument> {
    const ws = await this.findBySlugOrThrow(slug);
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user) {
      // We surface this as 404, not 400 — the resource being looked up
      // (the user) does not exist. Switch to a 202 + invite-email flow
      // when we wire up email delivery.
      throw new NotFoundException(`No user with email "${email}".`);
    }

    if (this.hasMember(ws, user._id)) {
      throw new ConflictException('User is already a member of this workspace.');
    }

    ws.members.push({
      userId: user._id,
      role,
      joinedAt: new Date(),
    } as WorkspaceMember);
    return ws.save();
  }

  async updateMemberRole(
    slug: string,
    targetUserId: string,
    role: Exclude<Role, 'owner'>,
  ): Promise<WorkspaceDocument> {
    const ws = await this.findBySlugOrThrow(slug);
    const targetObjectId = new Types.ObjectId(targetUserId);

    if (ws.ownerId.equals(targetObjectId)) {
      // Owner role is structural — to "demote" the owner, transfer
      // ownership first (a flow we don't yet expose).
      throw new ForbiddenException("Cannot change the workspace owner's role.");
    }

    const member = ws.members.find((m) => m.userId.equals(targetObjectId));
    if (!member) {
      throw new NotFoundException('Member not found in this workspace.');
    }
    member.role = role;
    return ws.save();
  }

  async removeMember(slug: string, targetUserId: string): Promise<WorkspaceDocument> {
    const ws = await this.findBySlugOrThrow(slug);
    const targetObjectId = new Types.ObjectId(targetUserId);

    if (ws.ownerId.equals(targetObjectId)) {
      throw new ForbiddenException('Cannot remove the workspace owner.');
    }
    const before = ws.members.length;
    ws.members = ws.members.filter((m) => !m.userId.equals(targetObjectId));
    if (ws.members.length === before) {
      throw new NotFoundException('Member not found in this workspace.');
    }
    return ws.save();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private hasMember(ws: WorkspaceDocument, userId: Types.ObjectId): boolean {
    return ws.members.some((m) => m.userId.equals(userId));
  }

  /**
   * Generate a URL-safe slug from a free-form name. Deliberately simple —
   * production-grade slugifiers (e.g. `slugify` package) handle Unicode
   * normalisation, but for our scope ASCII collapse is enough.
   */
  private slugify(name: string): string {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) {
      throw new BadRequestException('Workspace name must contain alphanumeric characters.');
    }
    return slug;
  }
}
