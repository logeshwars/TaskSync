import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateListDto } from './create-list.dto';

export class UpdateListDto extends PartialType(CreateListDto) {
  @ApiPropertyOptional({ description: 'Toggle archive state.' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
