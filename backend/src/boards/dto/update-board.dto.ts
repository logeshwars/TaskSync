import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateBoardDto } from './create-board.dto';

export class UpdateBoardDto extends PartialType(CreateBoardDto) {
  @ApiPropertyOptional({
    description: 'Set true to archive, false to unarchive. Omit to leave unchanged.',
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
