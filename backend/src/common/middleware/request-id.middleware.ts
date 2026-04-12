/**
 * Request-id middleware.
 *
 * Assigns every request a unique id (or honours an upstream `X-Request-Id`
 * header) and echoes it back on the response. This is the anchor that
 * ties a client error report, the server log line, and the realtime event
 * trail all back to the same originating call.
 *
 * We use `randomUUID()` from Node's built-in crypto — no extra dependency.
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
    // Attach to both req (for downstream logging) and res (so the client
    // can surface it in bug reports).
    (req as Request & { id: string }).id = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  }
}
