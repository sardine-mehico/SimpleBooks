import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs';
import type { Request } from 'express';
import { AuditService } from './audit.service';
import type { AuthUser } from '../auth/auth.service';

// Auto-records every successful DELETE request as RESOURCE_DELETED. The
// route path becomes the targetType; the last URL segment becomes the
// targetId. Login/logout/role changes/etc. are logged explicitly by their
// services (so this interceptor stays focused on the DELETE auto-capture).
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return next.handle().pipe(
      tap(() => {
        if (req.method !== 'DELETE') return;
        const user = req.user;
        const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
        const segments = (req.route?.path || req.url).split('/').filter(Boolean);
        const targetType = segments[0] ?? 'unknown';
        const rawId = req.params?.id ?? segments[segments.length - 1];
        const targetId = typeof rawId === 'string' ? rawId : undefined;
        const ua = req.headers['user-agent'];
        void this.audit.record({
          action: 'RESOURCE_DELETED',
          actorId: user?.id ?? null,
          targetType,
          targetId,
          ipAddress: ip,
          userAgent: typeof ua === 'string' ? ua : undefined,
        });
      }),
    );
  }
}
