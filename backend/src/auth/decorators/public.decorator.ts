import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as publicly accessible — bypasses the global JwtAuthGuard.
 * Use sparingly: only for endpoints that genuinely don't need auth (signup,
 * login, refresh, health checks).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
