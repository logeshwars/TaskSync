import { ApiProperty } from '@nestjs/swagger';

import type { ActivityType } from '../schemas/activity.schema';

export class ActivityResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  boardId!: string;

  @ApiProperty({ nullable: true })
  cardId!: string | null;

  @ApiProperty()
  actorId!: string;

  @ApiProperty({
    enum: [
      'card.created',
      'card.updated',
      'card.moved',
      'card.deleted',
      'card.assigned',
      'list.created',
      'list.updated',
      'list.deleted',
      'board.updated',
      'comment.added',
      'comment.deleted',
    ],
  })
  type!: ActivityType;

  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Record<string, unknown>;

  @ApiProperty()
  createdAt!: Date;
}
