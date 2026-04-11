import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

/**
 * Move a list relative to its siblings on the same board.
 *
 * Pass `beforeListId` to insert immediately before that list, or
 * `afterListId` to insert immediately after. Passing both is a 400 — they
 * are mutually exclusive.
 *
 * Omitting both moves the list to the end (the most common drag-drop
 * "drop to empty area" affordance).
 */
export class ReorderListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  beforeListId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  afterListId?: string;
}
