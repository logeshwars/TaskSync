import { SetMetadata } from '@nestjs/common';

/**
 * Workspace / board roles. Ordered from most to least privileged.
 *
 * - `owner`  — created the workspace; cannot be removed
 * - `admin`  — manage members and settings
 * - `member` — full read/write access to content
 * - `viewer` — read-only
 */
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export const ROLES_KEY = 'roles';

/**
 * Attach the allowed roles to a controller method.
 *
 *   @UseGuards(JwtAuthGuard, WorkspaceRolesGuard)
 *   @Roles('owner', 'admin')
 *   @Patch(':id')
 *   update(...) {}
 *
 * The role itself is resolved from workspace/board membership by the
 * resource-specific guard added in Phase 3.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
