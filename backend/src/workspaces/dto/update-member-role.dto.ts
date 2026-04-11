import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import type { Role } from '../../auth/decorators/roles.decorator';

/**
 * Payload accepted by `PATCH /workspaces/:slug/members/:userId`.
 *
 * Owner role is excluded — there is exactly one owner per workspace and
 * promoting someone to owner is a separate "transfer ownership" flow that
 * we'll add later if we need it.
 */
export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['admin', 'member', 'viewer'] })
  @IsEnum(['admin', 'member', 'viewer'] as const)
  role!: Exclude<Role, 'owner'>;
}
