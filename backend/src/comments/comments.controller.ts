import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { CardAccessGuard } from '../cards/guards/card-access.guard';
import { CommentsService } from './comments.service';
import { CommentResponseDto } from './dto/comment.response.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { type CommentDocument } from './schemas/comment.schema';

/**
 * Comments routes.
 *
 * - Listing and creating comments is scoped to the parent card, so we
 *   reuse CardAccessGuard (it already resolves board → role fall-through).
 * - Delete is by comment id, without carrying the card id on the URL.
 *   For delete we still want permission checks tied to the board, so we
 *   do a lightweight load-first inside the service and rely on the
 *   service's author check.
 */
@ApiTags('comments')
@ApiBearerAuth('access-token')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('cards/:id/comments')
  @UseGuards(CardAccessGuard, RolesGuard)
  @Roles('owner', 'admin', 'member', 'viewer')
  @ApiOperation({ summary: 'List all comments on a card, newest first.' })
  @ApiOkResponse({ type: CommentResponseDto, isArray: true })
  async list(@Param('id') cardId: string): Promise<CommentResponseDto[]> {
    const list = await this.comments.listByCard(cardId);
    return list.map((c) => this.toResponse(c));
  }

  @Post('cards/:id/comments')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(CardAccessGuard, RolesGuard)
  @Roles('owner', 'admin', 'member')
  @ApiOperation({ summary: 'Add a comment to a card.' })
  @ApiCreatedResponse({ type: CommentResponseDto })
  async create(
    @Param('id') cardId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    const comment = await this.comments.create(cardId, user.id, dto);
    return this.toResponse(comment);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment. Only the author can delete.' })
  @ApiNoContentResponse()
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    // Deliberately NOT using a board-level guard here — the service
    // enforces the "author only" rule, which is stricter than any role
    // check. Admins who want to moderate can do it through a future
    // dedicated endpoint.
    await this.comments.remove(id, user.id);
  }

  private toResponse(c: CommentDocument): CommentResponseDto {
    return {
      id: c._id.toString(),
      cardId: c.cardId.toString(),
      boardId: c.boardId.toString(),
      authorId: c.authorId.toString(),
      body: c.body,
      mentions: c.mentions.map((m) => m.toString()),
      editedAt: c.editedAt,
      createdAt: (c as unknown as { createdAt: Date }).createdAt,
    };
  }
}
