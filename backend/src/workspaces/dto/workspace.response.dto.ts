import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Role } from '../../auth/decorators/roles.decorator';

/**
 * View-model that the controllers serialise to. We define an explicit
 * response DTO instead of leaking Mongoose documents because:
 *   - Mongoose docs carry methods, internal state, and `_id` (vs `id`).
 *   - Swagger needs a concrete class to generate accurate `responses`
 *     blocks in the OpenAPI document.
 *   - It gives us a single chokepoint to drop sensitive fields if any
 *     ever sneak in.
 */
export class WorkspaceMemberResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: ['owner', 'admin', 'member', 'viewer'] })
  role!: Role;

  @ApiProperty()
  joinedAt!: Date;
}

export class WorkspaceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ type: [WorkspaceMemberResponseDto] })
  members!: WorkspaceMemberResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
