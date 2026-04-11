import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Payload for `POST /workspaces/:slug/boards`. The parent workspace is
 * identified by the URL slug, so it isn't part of this DTO.
 */
export class CreateBoardDto {
  @ApiProperty({ example: 'Q4 Roadmap', minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: '#7c3aed' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;
}
