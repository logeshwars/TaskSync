import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Payload accepted by `POST /workspaces`.
 *
 * The slug is optional — if absent we derive one from the name on the
 * service side. Allowing the client to override it lets the UI offer a
 * "customise URL" affordance.
 */
export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Engineering', minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    example: 'acme-engineering',
    description: 'Lowercase URL handle. Auto-generated from name if omitted.',
    pattern: '^[a-z0-9-]+$',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and dashes',
  })
  slug?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
