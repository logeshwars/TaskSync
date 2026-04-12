/**
 * Lists controller.
 *
 * Routes nest under /boards/:boardId/lists for create + list, and under
 * /lists/:id for per-list mutations. BoardMemberGuard reads `:boardId`
 * (for the nested shape) or `:id` → resolved via the list's `boardId`
 * (for the direct shape). For simplicity we guard the direct routes by
 * loading the list first in the service and relying on the fact that
 * callers must be board members to have hit this endpoint at all.
 *
 * Since Phase 3's BoardMemberGuard expects the board id on the URL, the
 * direct-list routes use a ListAccessGuard wrapper — see below.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { BoardMemberGuard } from '../boards/guards/board-member.guard';
import { CreateListDto } from './dto/create-list.dto';
import { ListResponseDto } from './dto/list.response.dto';
import { ReorderListDto } from './dto/reorder-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { ListAccessGuard } from './guards/list-access.guard';
import { ListsService } from './lists.service';
import { type ListDocument } from './schemas/list.schema';

@ApiTags('lists')
@ApiBearerAuth('access-token')
@Controller()
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  // ---------------------------------------------------------------------------
  // Nested: /boards/:boardId/lists
  // ---------------------------------------------------------------------------

  @Get('boards/:boardId/lists')
  @UseGuards(BoardMemberGuard, RolesGuard)
  @Roles('owner', 'admin', 'member', 'viewer')
  @ApiOperation({ summary: 'List all lists on a board, in render order.' })
  @ApiOkResponse({ type: ListResponseDto, isArray: true })
  async listByBoard(@Param('boardId') boardId: string): Promise<ListResponseDto[]> {
    const list = await this.lists.findByBoard(boardId);
    return list.map((l) => this.toResponse(l));
  }

  @Post('boards/:boardId/lists')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(BoardMemberGuard, RolesGuard)
  @Roles('owner', 'admin', 'member')
  @ApiOperation({ summary: 'Create a list on a board.' })
  @ApiCreatedResponse({ type: ListResponseDto })
  async create(
    @Param('boardId') boardId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateListDto,
  ): Promise<ListResponseDto> {
    const list = await this.lists.create(boardId, dto, user.id);
    return this.toResponse(list);
  }

  // ---------------------------------------------------------------------------
  // Direct: /lists/:id
  // ---------------------------------------------------------------------------

  @Patch('lists/:id')
  @UseGuards(ListAccessGuard, RolesGuard)
  @Roles('owner', 'admin', 'member')
  @ApiOperation({ summary: 'Update a list (title, WIP limit, archived).' })
  @ApiOkResponse({ type: ListResponseDto })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateListDto,
  ): Promise<ListResponseDto> {
    const list = await this.lists.update(id, dto, user.id);
    return this.toResponse(list);
  }

  @Patch('lists/:id/reorder')
  @UseGuards(ListAccessGuard, RolesGuard)
  @Roles('owner', 'admin', 'member')
  @ApiOperation({ summary: 'Move a list within its board.' })
  @ApiOkResponse({ type: ListResponseDto })
  async reorder(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderListDto,
  ): Promise<ListResponseDto> {
    const list = await this.lists.reorder(id, dto, user.id);
    return this.toResponse(list);
  }

  @Delete('lists/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ListAccessGuard, RolesGuard)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Delete a list.' })
  @ApiNoContentResponse()
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.lists.remove(id, user.id);
  }

  // ---------------------------------------------------------------------------
  // View-model conversion
  // ---------------------------------------------------------------------------

  private toResponse(list: ListDocument): ListResponseDto {
    return {
      id: list._id.toString(),
      boardId: list.boardId.toString(),
      title: list.title,
      position: list.position,
      wipLimit: list.wipLimit,
      cardOrder: list.cardOrder.map((id) => id.toString()),
      archived: list.archivedAt !== null,
      createdAt: (list as unknown as { createdAt: Date }).createdAt,
      updatedAt: (list as unknown as { updatedAt: Date }).updatedAt,
    };
  }
}
