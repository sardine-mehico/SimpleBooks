import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Mark a controller method (or whole controller) as not requiring auth.
// Used by SessionGuard to short-circuit before lookup.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
