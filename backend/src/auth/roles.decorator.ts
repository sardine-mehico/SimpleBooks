import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { Capability as Cap } from './capabilities';

export const ROLES_KEY = 'roles';
export const CAPABILITY_KEY = 'capability';

// @Roles('ADMIN') — restrict route to one or more roles.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// @Capability('action.delete') — restrict route by capability key. Preferred
// over @Roles when the requirement is behavioural (e.g. delete) rather than
// rank-based (e.g. only-admin). Capabilities are checked AFTER role match;
// if both decorators are present, both must pass.
export const Capability = (capability: Cap) => SetMetadata(CAPABILITY_KEY, capability);

// Convenience: admin-only.
export const AdminOnly = () => Roles('ADMIN');
