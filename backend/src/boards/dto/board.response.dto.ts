import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Role } from '../../auth/decorators/roles.decorator';

export class BoardMemberResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: ['owner', 'admin', 'member', 'viewer'] })
  role!: Role;

  @ApiProperty()
  joinedAt!: Date;
}

export class BoardResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  color?: string;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty({ type: [BoardMemberResponseDto] })
  members!: BoardMemberResponseDto[];

  @ApiProperty({ type: [String], description: 'Ordered list of List ids.' })
  listOrder!: string[];

  @ApiProperty()
  archived!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

/**
 * Hydrated read response — board metadata + every list and every card on
 * it in a single payload. The frontend uses this for the initial board
 * paint so we don't waterfall N requests.
 *
 * Lists and cards are typed as `unknown[]` for now because their schemas
 * land in Phase 4. We'll tighten the types as soon as those exist.
 */
export class HydratedBoardResponseDto extends BoardResponseDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  lists!: unknown[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  cards!: unknown[];
}
