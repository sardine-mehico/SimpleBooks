import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService, SESSION_LIFETIME_MS } from './auth.service';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth.service';
import { RolesService } from '../roles/roles.service';

class LoginDto {
  @IsString() username!: string;
  @IsString() @MinLength(1) password!: string;
}

const COOKIE_NAME = 'sb_session';

// Whether to mark the session cookie `Secure`. Defaults to NODE_ENV=production,
// but an explicit `SESSION_COOKIE_SECURE=true|false` overrides — needed when the
// stack runs with NODE_ENV=production behind a plain-HTTP LAN endpoint (browsers
// refuse to store Secure cookies on http://). Set to `false` to allow HTTP LAN
// login; keep at `true` (or unset) when fronted by HTTPS.
function sessionCookieSecure(): boolean {
  const override = process.env.SESSION_COOKIE_SECURE;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private roles: RolesService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const ua = req.headers['user-agent'];
    const { token, user } = await this.auth.login(dto.username, dto.password, ip, ua);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: sessionCookieSecure(),
      maxAge: SESSION_LIFETIME_MS,
      path: '/',
    });
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[COOKIE_NAME];
    await this.auth.logout(token);
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return { user, capabilities: await this.roles.capabilitiesForRole(user.role) };
  }

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthUser) {
    return this.roles.capabilitiesForRole(user.role);
  }
}
