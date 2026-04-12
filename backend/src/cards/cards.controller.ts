/**
 * Cards controller.
 *
 * Nested under /lists/:listId/cards for create, and /cards/:id for direct
 * operations. The POST route uses ListAccessGuard to confirm the caller
 * has write access to the parent list's board before creating.
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
import { ListAccessGuard } from '../lists/guards/list-access.guard';
import { CardsService } from './cards.service';
import { CardResponseDto } from './dto/card.response.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CardAccessGuard } from './guards/card-access.guard';
import { type CardDocument } from './schemas/card.schema';

@ApiTags('cards')
@ApiBearerAuth('access-token')
@Controller()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  // ---------------------------------------------------------------------------
  // Nested reads/writes
  // ---------------------------------------------------------------------------

  @Get('boards/:boardId/cards')
  @UseGuards(BoardMemberGuard, RolesGuard)
  @Roles('owner', 'admin', 'member', 'viewer')
  @ApiOperation({ summary: 'List every card on a board (flat list).' })
  @ApiOkResponse({ type: CardResponseDto, isArray: true })
  async listByBoard(@Param('boardId') boardId: string): Promise<CardResponseDto[]> {
    const list = await this.cards.findByBoard(boardId);
    return list.map((c) => this.toResponse(c));
  }

  @Post('lists/:id/cards')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ListAccessGuard, RolesGuard)
  @Roles('owner', 'admin', 'member')
  @ApiOperation({ summary: 'Create a card at the end of a list.' })
  @ApiCreatedResponse({ type: CardResponseDto })
  async create(
    @Param('id') listId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCardDto,
  ): Promise<CardResponseDto> {
    const card = await this.cards.create(listId, user.id, dto);
    return this.toResponse(card);
  }

  // ---------------------------------------------------------------------------
  // Direct /cards/:id
  // ---------------------------------------------------------------------------

  @Get('cards/:id')
  @UseGuards(CardAccessGuard, RolesGuard)
  @Roles('owner', 'admin', 'member', 'viewer')
  @ApiOperation({ summary: 'Fetch a card by id.' })
  @ApiOkResponse({ type: CardResponseDto })
  async findOne(@Param('id') id: string): Promise<CardResponseDto> {
    const card = await this.cards.findByIdOrThrow(id);
    return this.toResponse(card);
  }

  @Patch('cards/:id')
  @UseGuards(CardAccessGuard, RolesGuard)
  @Roles('owner', 'admin', 'member')
  @ApiOperation({ summary: 'Update card fields.' })
  @ApiOkResponse({ type: CardResponseDto })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCardDto,
  ): Promise<CardResponseDto> {
    const card = await this.cards.update(id, dto, user.id);
    return this.toResponse(card);
  }

  @Patch('cards/:id/move')
  @UseGuards(CardAccessGuard, RolesGuard)
  @Roles('owner', 'admin', 'member')
  @ApiOperation({ summary: 'Move a card within or across lists on the same board.' })
  @ApiOkResponse({ type: CardResponseDto })
  async move(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MoveCardDto,
  ): Promise<CardResponseDto> {
    const card = await this.cards.move(id, dto, user.id);
    return this.toResponse(card);
  }

  @Delete('cards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CardAccessGuard, RolesGuard)
  @Roles('owner', 'admin', 'member')
  @ApiOperation({ summary: 'Delete a card.' })
  @ApiNoContentResponse()
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.cards.remove(id, user.id);
  }

  // ---------------------------------------------------------------------------
  // View-model conversion
  // ---------------------------------------------------------------------------

  private toResponse(card: CardDocument): CardResponseDto {
    return {
      id: card._id.toString(),
      boardId: card.boardId.toString(),
      listId: card.listId.toString(),
      title: card.title,
      description: card.description,
      priority: card.priority,
      tags: card.tags,
      assignees: card.assignees.map((a) => a.toString()),
      dueDate: card.dueDate,
      progress: card.progress,
      position: card.position,
      attachments: card.attachments.map((a) => ({
        url: a.url,
        name: a.name,
        size: a.size,
        contentType: a.contentType,
        uploadedAt: a.uploadedAt,
      })),
      commentsCount: card.commentsCount,
      createdBy: card.createdBy.toString(),
      archived: card.archivedAt !== null,
      createdAt: (card as unknown as { createdAt: Date }).createdAt,
      updatedAt: (card as unknown as { updatedAt: Date }).updatedAt,
    };
  }
}
