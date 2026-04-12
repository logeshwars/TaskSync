import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BoardMemberGuard } from '../boards/guards/board-member.guard';
import { ActivityService } from './activity.service';
import { ActivityResponseDto } from './dto/activity.response.dto';

@ApiTags('activity')
@ApiBearerAuth('access-token')
@Controller()
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('boards/:boardId/activity')
  @UseGuards(BoardMemberGuard, RolesGuard)
  @Roles('owner', 'admin', 'member', 'viewer')
  @ApiOperation({ summary: 'Paginated activity feed for a board, newest first.' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'before',
    required: false,
    description: 'ISO timestamp — return entries strictly older than this.',
  })
  @ApiOkResponse({ type: ActivityResponseDto, isArray: true })
  async feed(
    @Param('boardId') boardId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<ActivityResponseDto[]> {
    const entries = await this.activity.findFeed(boardId, {
      limit: limit ? Number(limit) : undefined,
      before: before ? new Date(before) : undefined,
    });
    return entries.map((e) => ({
      id: e._id.toString(),
      boardId: e.boardId.toString(),
      cardId: e.cardId ? e.cardId.toString() : null,
      actorId: e.actorId.toString(),
      type: e.type,
      payload: e.payload,
      createdAt: (e as unknown as { createdAt: Date }).createdAt,
    }));
  }
}
