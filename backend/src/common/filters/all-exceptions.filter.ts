/**
 * Global exception filter.
 *
 * Goal: every error that escapes a controller — whether it's a NestJS
 * `HttpException`, a Mongoose error, or a stray runtime crash — turns into a
 * predictable JSON response so the frontend can rely on a single error shape.
 *
 * Response envelope:
 *   {
 *     statusCode: number,
 *     timestamp:  ISO-8601 string,
 *     path:       request URL,
 *     message:    string | string[],
 *     error?:     short tag, e.g. "Bad Request"
 *   }
 *
 * Senior rationale: a single envelope means the frontend's error toast,
 * form-error mapper, and error boundary all consume the same shape. No
 * "is it `error.message` or `error.error.message` this time?" guessing.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
  error?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.normalize(exception);

    const body: ErrorResponseBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      error,
    };

    // 5xx are bugs — log with stack. 4xx are caller errors — log without.
    if (status >= 500) {
      this.logger.error(
        `[${request.method} ${request.url}] ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`[${request.method} ${request.url}] ${JSON.stringify(message)}`);
    }

    response.status(status).json(body);
  }

  /**
   * Convert any thrown value into a (status, message, error) triple.
   *
   * Centralised here so future handling for Mongoose / Mongo / Joi /
   * SyntaxError can be added in one place rather than scattered across
   * controllers.
   */
  private normalize(exception: unknown): {
    status: number;
    message: string | string[];
    error?: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      // Nest's HttpException can return either a string or an object body.
      if (typeof res === 'string') {
        return { status, message: res };
      }

      const obj = res as { message?: string | string[]; error?: string };
      return {
        status,
        message: obj.message ?? exception.message,
        error: obj.error,
      };
    }

    // Anything else is unexpected — surface a generic 500 to the client and
    // rely on the log line above for the actual cause.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: exception instanceof Error ? exception.message : 'Internal server error',
      error: 'Internal Server Error',
    };
  }
}
