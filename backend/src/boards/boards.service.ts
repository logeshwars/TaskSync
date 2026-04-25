/**
 * Boards service.
 *
 * Owns reads/writes for the `boards` collection. Cross-references the
 * workspaces module for permission resolution and the (future) lists/cards
 * modules for hydrated reads.
 *
 * Hydration:
 *   `findHydrated()` returns a board plus its lists and cards in one call.
 *   For Phase 3 the lists/cards modules don't exist yet, so we return
 *   empty arrays — Phase 4 will plug those in via injected services.
 */
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import type { Role } from '../auth/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { Board, type BoardDocument, type BoardMember } from './schemas/board.schema';

@Injectable()
export class BoardsService {
  constructor(
    @InjectModel(Board.name) private readonly boardModel: Model<BoardDocument>,
    private readonly workspaces: WorkspacesService,
    private readonly users: UsersService,
  ) {}

  /**
   * Look up a user id by email. Lives on the boards service (rather than
   * the controller) so the controller doesn't need to know about the
   * UsersService — keeps the controller dependency surface tight.
   */
  async resolveUserIdByEmailOrThrow(email: string): Promise<string> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user) {
      throw new NotFoundException(`No user with email "${email}".`);
    }
    return user._id.toString();
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async findById(id: string): Promise<BoardDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.boardModel.findById(id).exec();
  }

  async findByIdOrThrow(id: string): Promise<BoardDocument> {
    const board = await this.findById(id);
    if (!board) {
      throw new NotFoundException('Board not found.');
    }
    return board;
  }

  /**
   * All boards inside a workspace visible to any workspace member.
   * Board-level membership is enforced separately on read/write routes.
   * WorkspaceMemberGuard already verified workspace membership before this runs.
   */
  async findInWorkspace(
    workspaceSlug: string,
    _userId: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<BoardDocument[]> {
    const ws = await this.workspaces.findBySlugOrThrow(workspaceSlug);
    const filter: Record<string, unknown> = { workspaceId: ws._id };
    if (!opts.includeArchived) {
      filter.archivedAt = null;
    }
    return this.boardModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  /**
   * Hydrated read — board + lists + cards. The actual list/card lookup
   * is stubbed out until Phase 4 implements those modules. Keeping the
   * shape stable now means the frontend can build against the contract
   * before the data is real.
   */
  async findHydrated(id: string): Promise<{
    board: BoardDocument;
    lists: unknown[];
    cards: unknown[];
  }> {
    const board = await this.findByIdOrThrow(id);
    return { board, lists: [], cards: [] };
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async create(
    workspaceSlug: string,
    creatorId: string,
    dto: CreateBoardDto,
  ): Promise<BoardDocument> {
    const ws = await this.workspaces.findBySlugOrThrow(workspaceSlug);
    const creatorObjectId = new Types.ObjectId(creatorId);

    // Seed board membership with the creator as owner. Workspace admins
    // get implicit access through the membership guard's "fall through to
    // workspace role" logic — see `findMemberRole()` below.
    const board = await this.boardModel.create({
      workspaceId: ws._id,
      title: dto.title,
      description: dto.description,
      color: dto.color,
      createdBy: creatorObjectId,
      members: [{ userId: creatorObjectId, role: 'owner', joinedAt: new Date() }],
      listOrder: [],
    });
    return board;
  }

  async update(id: string, dto: UpdateBoardDto): Promise<BoardDocument> {
    const board = await this.findByIdOrThrow(id);
    if (dto.title !== undefined) board.title = dto.title;
    if (dto.description !== undefined) board.description = dto.description;
    if (dto.color !== undefined) board.color = dto.color;
    if (dto.archived !== undefined) {
      board.archivedAt = dto.archived ? new Date() : null;
    }
    return board.save();
  }

  async remove(id: string): Promise<void> {
    const result = await this.boardModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Board not found.');
    }
    // Cascading delete of lists/cards is the responsibility of those
    // modules and will hook into a domain event in Phase 5.
  }

  // ---------------------------------------------------------------------------
  // Membership / role resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve the requester's effective role on a board.
   *
   * The rule is:
   *   1. If they are an explicit board member, that role wins.
   *   2. Otherwise, if they are a workspace owner or admin, they get
   *      'admin' on every board in that workspace (so workspace admins
   *      can manage any board without being individually invited).
   *   3. Otherwise, they have no access.
   *
   * This is the canonical place to extend the access model — every guard
   * in the boards module routes through here.
   */
  async findEffectiveRole(boardId: string, userId: string): Promise<Role | null> {
    const board = await this.findById(boardId);
    if (!board) {
      return null;
    }
    const userObjectId = new Types.ObjectId(userId);

    const explicit = board.members.find((m) => m.userId.equals(userObjectId));
    if (explicit) {
      return explicit.role;
    }

    // Fall through to workspace-level permissions: workspace owners and
    // admins automatically get admin on every board in their workspace.
    const wsRole = await this.workspaces.findMemberRoleByWorkspaceId(
      board.workspaceId,
      userId,
    );
    if (wsRole === 'owner' || wsRole === 'admin') {
      return 'admin';
    }
    return null;
  }

  async addMember(
    boardId: string,
    targetUserId: string,
    role: Exclude<Role, 'owner'>,
  ): Promise<BoardDocument> {
    const board = await this.findByIdOrThrow(boardId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    if (board.members.some((m) => m.userId.equals(targetObjectId))) {
      throw new ConflictException('User is already a board member.');
    }
    board.members.push({
      userId: targetObjectId,
      role,
      joinedAt: new Date(),
    } as BoardMember);
    return board.save();
  }

  async removeMember(boardId: string, targetUserId: string): Promise<BoardDocument> {
    const board = await this.findByIdOrThrow(boardId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    if (board.createdBy.equals(targetObjectId)) {
      throw new ForbiddenException('Cannot remove the board creator.');
    }
    const before = board.members.length;
    board.members = board.members.filter((m) => !m.userId.equals(targetObjectId));
    if (board.members.length === before) {
      throw new NotFoundException('Member not found on this board.');
    }
    return board.save();
  }
}
