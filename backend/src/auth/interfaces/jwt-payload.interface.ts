/**
 * Shapes used by the JWT layer.
 *
 * `JwtPayload` is what we sign and verify; `AuthenticatedUser` is what we
 * attach to the request after a successful guard pass.
 */
import type { Role } from '../decorators/roles.decorator';

export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  /** User id (Mongo ObjectId as string). */
  sub: string;
  email: string;
  type: TokenType;
  /** JWT id — only set on refresh tokens. Used as the rotation key. */
  jti?: string;
}

/**
 * What ends up on `req.user` after the JwtAuthGuard runs. Keep this minimal
 * — anything more belongs in a per-request resolver, not in every payload.
 *
 * `role` is populated by per-resource membership guards (workspace, board)
 * before RolesGuard runs. It is `undefined` on routes that don't target a
 * specific resource.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role?: Role;
}
