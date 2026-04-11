/**
 * Request/response logging interceptor.
 *
 * Logs every HTTP request with method, URL, status code, and duration in ms.
 * Sits in front of every route via `app.useGlobalInterceptors()` in main.ts.
 *
 * Why an interceptor instead of middleware?
 *   Interceptors run inside the Nest pipeline, so they see the *resolved*
 *   route handler and can measure end-to-end execution time including pipes
 *   and other interceptors. Middleware runs earlier and can't observe the
 *   final status code reliably.
 *
 * Future evolution (Phase 7.4): swap the manual `Logger.log` for a Pino
 * pino-http child logger so we get structured JSON logs with request IDs.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Skip non-HTTP contexts (e.g. websocket, microservice). Without this
    // guard the interceptor would crash trying to read req/res from a
    // socket frame.
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        // Log on both success and error so we never lose the timing line.
        next: () => this.log(req, res, start),
        error: () => this.log(req, res, start),
      }),
    );
  }

  private log(req: Request, res: Response, start: number): void {
    const duration = Date.now() - start;
    this.logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  }
}
