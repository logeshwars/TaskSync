import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';

import type { Role } from '../../auth/decorators/roles.decorator';

/**
 * Payload accepted by `POST /workspaces/:slug/members`.
 *
 * We invite by email rather than userId so the inviter doesn't need to
 * know whether the recipient already has an account. (When we ship the
 * email pipeline, this same endpoint will dispatch an invite mail for
 * non-existent users.) For Phase 3 we just attach existing users.
 */
export class InviteMemberDto {
  @ApiProperty({ example: 'teammate@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ['admin', 'member', 'viewer'], example: 'member' })
  @IsEnum(['admin', 'member', 'viewer'] as const)
  role!: Exclude<Role, 'owner'>;
}
