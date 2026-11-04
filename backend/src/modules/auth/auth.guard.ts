import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Validates every protected request; production never falls back to shared demo data. */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sign in is required to access this resource.');
    }
    const token = header.slice('Bearer '.length);
    if (!token || token === 'null' || token === 'undefined' || token.startsWith('demo-')) {
      throw new UnauthorizedException('Your session is invalid or expired.');
    }
    request.user = await this.authService.validateToken(token);
    return true;
  }
}
