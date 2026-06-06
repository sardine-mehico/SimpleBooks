import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './auth.service';

// Pull the request.user populated by SessionGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthUser | undefined;
  },
);
