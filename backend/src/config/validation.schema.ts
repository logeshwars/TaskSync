/**
 * Joi schema for environment variables.
 *
 * Runs on application startup via `ConfigModule.forRoot({ validationSchema })`.
 * If any required variable is missing or malformed, Nest refuses to boot —
 * a hard failure is preferable to silently launching a broken service.
 */
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // --- Application -----------------------------------------------------------
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),

  // --- MongoDB ---------------------------------------------------------------
  MONGO_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),

  // --- Redis -----------------------------------------------------------------
  REDIS_HOST: Joi.string().hostname().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // --- JWT -------------------------------------------------------------------
  // Secrets must be at least 32 chars to deter accidental use of weak values.
  // Generate with `openssl rand -hex 64`.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),

  // --- CORS ------------------------------------------------------------------
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:5173'),
});
