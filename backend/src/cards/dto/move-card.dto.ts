import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

/**
 * Payload for `PATCH /cards/:id/move`.
 *
 * `targetListId` is required — even a same-list reorder restates it so
 * the server can update the source/destination list's `cardOrder` arrays
 * without ambiguity.
 *
 * `beforeCardId` / `afterCardId` are mutually exclusive anchors. Omit
 * both to drop at the end of the target list.
 */
export class MoveCardDto {
  @ApiProperty({ description: 'Destination list id (same list is allowed).' })
  @IsMongoId()
  targetListId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  beforeCardId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  afterCardId?: string;
}
