import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateListDto {
  @ApiProperty({ example: 'In Progress', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @ApiPropertyOptional({
    description: 'Optional Work-In-Progress cap. Omit for no limit.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  wipLimit?: number;
}
