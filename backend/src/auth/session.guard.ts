import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector, ModuleRef } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ApiKeysService } from '../api-keys/api-keys.service';

@Injectable()
export class SessionGuard implements CanActivate {
  // ApiKeysService is resolved lazily via ModuleRef to avoid a circular
  // dependency between AuthModule and ApiKeysModule (which itself needs
  // auth helpers transitively).
  private apiKeys?: ApiKeysService;

  constructor(
    private reflector: Reflector,
    private auth: AuthService,
    private moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: any }>();

    // Path A: cookie session (browser).
    const token = req.cookies?.['sb_session'];
    let user = await this.auth.validateSession(token);

    // Path B: Bearer API key (programmatic).
    if (!user) {
      const auth = req.headers['authorization'];
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        const secret = auth.slice('Bearer '.length).trim();
        if (!this.apiKeys) {
          this.apiKeys = this.moduleRef.get(ApiKeysService, { strict: false });
        }
        user = await this.apiKeys.validateBearer(secret);
      }
    }

    if (!user) throw new UnauthorizedException('Authentication required.');
    req.user = user;
    return true;
  }
}
