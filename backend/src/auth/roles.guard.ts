import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@prisma/client';
import { ROLES_KEY, CAPABILITY_KEY } from './roles.decorator';
import { type Capability } from './capabilities';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthUser } from './auth.service';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private roles: RolesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      // SessionGuard should have rejected already. Defensive belt + braces.
      throw new ForbiddenException('Authentication required.');
    }

    // 1. Method-level role check.
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Your role does not permit this action.');
    }

    // 2. Method-level capability check.
    const requiredCapability = this.reflector.getAllAndOverride<Capability | undefined>(
      CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredCapability && !(await this.roles.hasCapability(user.role, requiredCapability))) {
      throw new ForbiddenException(`Capability "${requiredCapability}" denied for role ${user.role}.`);
    }

    // 3. Implicit capability inference: any DELETE request requires
    // action.delete. This catches every existing controller's delete
    // endpoint without per-route decoration.
    if (req.method === 'DELETE' && !(await this.roles.hasCapability(user.role, 'action.delete'))) {
      throw new ForbiddenException('Your role does not permit delete actions.');
    }

    return true;
  }
}
