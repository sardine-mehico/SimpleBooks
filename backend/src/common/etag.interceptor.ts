import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { etagFor } from './etag';

// Global interceptor that attaches an `ETag` response header whenever the
// response body has a top-level `updatedAt`. Lets clients read the ETag on
// GET / PATCH and send it back via `If-Match` for optimistic concurrency.
@Injectable()
export class EtagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap((body) => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return;
        const updatedAt = (body as any).updatedAt;
        if (!updatedAt) return;
        const res = context.switchToHttp().getResponse();
        if (res && typeof res.setHeader === 'function') {
          res.setHeader('ETag', etagFor(updatedAt));
        }
      }),
    );
  }
}
