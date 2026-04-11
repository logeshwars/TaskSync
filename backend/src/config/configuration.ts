/**
 * Strongly-typed configuration loader.
 *
 * Pattern:
 *   - This file is the SINGLE place that reads `process.env`.
 *   - Everything else asks the `ConfigService<AppConfig, true>` for typed values.
 *   - The Joi schema in `validation.schema.ts` runs first and rejects startup
 *     on bad/missing env vars, so by the time this function executes we know
 *     every required variable is present and well-formed.
 *
 * Why a separate function and type rather than reading process.env at the
 * usage site?
 *   1. Type safety end-to-end — autocomplete on `config.get('mongoUri')`.
 *   2. Centralised defaults — easier to change one place than to grep the codebase.
 *   3. Joi validation runs once on boot, not per-request.
 */

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  mongoUri: string;

  redis: {
    host: string;
    port: number;
    password?: string;
  };

  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string; // e.g. "15m"
    refreshTtl: string; // e.g. "7d"
  };

  corsOrigin: string;
}

/**
 * Reads a required env var. Throws if missing — should never actually fire
 * in practice because the Joi schema rejects boot before this point. The
 * throw is a defensive narrowing for the type system.
 */
function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(
      `Required env var ${key} is missing. Joi validation should have caught this — check src/config/validation.schema.ts.`,
    );
  }
  return value;
}

export const configuration = (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'],
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as AppConfig['logLevel'],

  mongoUri: required('MONGO_URI'),

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
    // Empty-string password is treated as "no password" — common when
    // dev Redis runs unauthenticated.
    password: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD : undefined,
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },

  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
});
