/**
 * Boards controller.
 *
 * Two route groups:
 *   1. Nested under `/workspaces/:slug/boards` — uses WorkspaceMemberGuard
 *      to require workspace membership before listing/creating boards.
 *   2. Direct `/boards/:id` — uses BoardMemberGuard, which resolves an
 *      effective role (board membership OR fallback to workspace owner/admin).
 *
 * The two groups live on a single controller to keep the boards domain
 * cohesive. Splitting by URL prefix would scatter related code.
 */
import {
  Body,
  Controller,
  Delete,
  forwardRef,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { BoardCacheService } from '../common/cache/board-cache.service';
import { InviteMemberDto } from '../workspaces/dto/invite-member.dto';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { CardsService } from '../cards/cards.service';
import { ListsService } from '../lists/lists.service';
import { BoardsService } from './boards.service';
import {
  BoardResponseDto,
  HydratedBoardResponseDto,
} from './dto/board.response.dto';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { BoardMemberGuard } from './guards/board-member.guard';
import {
  type BoardDocument,
  type BoardMember,
} from './schemas/board.schema';

@ApiTags('boards')
@ApiBearerAuth('access-token')
@Controller()
export class BoardsController {
  constructor(
    private readonly boards: BoardsService,
    private readonly boardCache: BoardCacheService,
    // forwardRef breaks the module-level circular dependency: ListsModule
    // imports BoardsModule, and BoardsModule needs ListsModule to hydrate
    // reads. Nest resolves the cycle at runtime when we use forwardRef on
    // both the module import AND the injected dependency.
    @Inject(forwardRef(() => ListsService))
    private readonly lists: ListsService,
    @Inject(forwardRef(() => CardsService))
    private readonly cards: CardsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Nested under /workspaces/:slug/boards
  // ---------------------------------------------------------------------------

  @Get('workspaces/:slug/boards')
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles('owner', 'admin', 'member', 'viewer')
  @ApiOperation({ summary: 'List boards inside a workspace.' })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  @ApiOkResponse({ type: BoardResponseDto, isArray: true })
  async listInWorkspace(
    @Param('slug') slug: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<BoardResponseDto[]> {
    const list = await this.boards.findInWorkspace(slug, {
      includeArchived: includeArchived === 'true',
    });
    return list.map((b) => this.toResponse(b));
  }

  @Post('workspaces/:slug/boards')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles('owner', 'admin', 'member')
  @ApiOperation({ summary: 'Create a board inside a workspace.' })
  @ApiCreatedResponse({ type: BoardResponseDto })
  async create(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBoardDto,
  ): Promise<BoardResponseDto> {
    const board = await this.boards.create(slug, user.id, dto);
    return this.toResponse(board);
  }

  // ---------------------------------------------------------------------------
  // /boards/:id — direct access to a single board
  // ---------------------------------------------------------------------------

  @Get('boards/:id')
  @UseGuards(BoardMemberGuard, RolesGuard)
  @Roles('owner', 'admin', 'member', 'viewer')
  @ApiOperation({
    summary: 'Fetch a board (hydrated). Includes lists and cards in a single payload.',
  })
  @ApiOkResponse({ type: HydratedBoardResponseDto })
  async findOne(@Param('id') id: string): Promise<HydratedBoardResponseDto> {
    // Check Redis first — saves two Mongo queries on cache hit.
    const cached = await this.boardCache.get<HydratedBoardResponseDto>(id);
    if (cached) return cached;

    const board = await this.boards.findByIdOrThrow(id);
    // Fire the two read queries in parallel — they're independent and
    // we want to minimise tail latency for the most-hit endpoint.
    const [lists, cards] = await Promise.all([
      this.lists.findByBoard(board._id),
      this.cards.findByBoard(board._id),
    ]);
    const hydrated: HydratedBoardResponseDto = {
      ...this.toResponse(board),
      lists: lists.map((l) => ({
        id: l._id.toString(),
        boardId: l.boardId.toString(),
        title: l.title,
        position: l.position,
        wipLimit: l.wipLimit,
        cardOrder: l.cardOrder.map((cid) => cid.toString()),
        archived: l.archivedAt !== null,
      })),
      cards: cards.map((c) => ({
        id: c._id.toString(),
        boardId: c.boardId.toString(),
        listId: c.listId.toString(),
        title: c.title,
        description: c.description,
        priority: c.priority,
        tags: c.tags,
        assignees: c.assignees.map((a) => a.toString()),
        dueDate: c.dueDate,
        progress: c.progress,
        position: c.position,
        commentsCount: c.commentsCount,
        createdBy: c.createdBy.toString(),
        archived: c.archivedAt !== null,
      })),
    };

    // Store asynchronously — don't block the response on the cache write.
    void this.boardCache.set(id, hydrated);

    return hydrated;
  }

  @Patch('boards/:id')
  @UseGuards(BoardMemberGuard, RolesGuard)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Update board metadata.' })
  @ApiOkResponse({ type: BoardResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBoardDto,
  ): Promise<BoardResponseDto> {
    const board = await this.boards.update(id, dto);
    return this.toResponse(board);
  }

  @Delete('boards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(BoardMemberGuard, RolesGuard)
  @Roles('owner')
  @ApiOperation({ summary: 'Delete a board. Board owner only.' })
  @ApiNoContentResponse()
  async remove(@Param('id') id: string): Promise<void> {
    await this.boards.remove(id);
  }

  // ---------------------------------------------------------------------------
  // Board membership management
  // ---------------------------------------------------------------------------

  @Post('boards/:id/members')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(BoardMemberGuard, RolesGuard)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Add a user to the board by email.' })
  @ApiCreatedResponse({ type: BoardResponseDto })
  async addMember(
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
  ): Promise<BoardResponseDto> {
    // The DTO uses email so the inviter doesn't need to know the recipient's
    // ObjectId. Resolution happens inside the service layer.
    const userId = await this.boards.resolveUserIdByEmailOrThrow(dto.email);
    const updated = await this.boards.addMember(id, userId, dto.role);
    return this.toResponse(updated);
  }

  @Delete('boards/:id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(BoardMemberGuard, RolesGuard)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Remove a user from the board.' })
  @ApiNoContentResponse()
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.boards.removeMember(id, userId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private toResponse(board: BoardDocument): BoardResponseDto {
    return {
      id: board._id.toString(),
      workspaceId: board.workspaceId.toString(),
      title: board.title,
      description: board.description,
      color: board.color,
      createdBy: board.createdBy.toString(),
      members: board.members.map((m: BoardMember) => ({
        userId: m.userId.toString(),
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      listOrder: board.listOrder.map((id) => id.toString()),
      archived: board.archivedAt !== null,
      createdAt: (board as unknown as { createdAt: Date }).createdAt,
      updatedAt: (board as unknown as { updatedAt: Date }).updatedAt,
    };
  }
}
