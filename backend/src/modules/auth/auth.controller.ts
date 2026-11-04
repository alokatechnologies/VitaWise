import { Controller, Post, Get, Put, Body, Headers, UseGuards, Req, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import { AuthService, SignupDto, LoginDto } from './auth.service';
import { SupabaseAuthGuard } from './auth.guard';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('verify-parent-admin')
  @HttpCode(HttpStatus.OK)
  async verifyParentAdmin(@Body('email') email: string, @Body('password') password: string) {
    return this.authService.verifyParentAdmin(email, password);
  }

  @Post('register-family')
  @HttpCode(HttpStatus.CREATED)
  async registerFamily(@Body() body: any) {
    return this.authService.registerFamily(body);
  }

  @Post('register-with-parent')
  @HttpCode(HttpStatus.CREATED)
  async registerWithParent(@Body() body: any) {
    return this.authService.registerWithParent(body);
  }

  @Post('parent-head-setup')
  @HttpCode(HttpStatus.CREATED)
  async setupParentHead(@Body() body: any) {
    return this.authService.setupParentHead(body);
  }

  @Post('password-reset')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body('email') email: string) {
    return this.authService.requestPasswordReset(email?.trim());
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshSession(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    return this.authService.logout(token);
  }

  @Get('demo-session')
  @HttpCode(HttpStatus.OK)
  async getDemoSession() {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    return this.authService.getDemoSession();
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  async getProfile(@Req() req: any) {
    return {
      authenticated: true,
      user: req.user,
    };
  }

  @Post('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard)
  async updateProfile(@Req() req: any, @Body() body: any) {
    return this.authService.updateProfile(req.user.id, body);
  }

  @Put('me')
  @UseGuards(SupabaseAuthGuard)
  async updateMePut(@Req() req: any, @Body() body: any) {
    return this.authService.updateProfile(req.user.id, body);
  }

  @Post('me')
  @UseGuards(SupabaseAuthGuard)
  async updateMePost(@Req() req: any, @Body() body: any) {
    return this.authService.updateProfile(req.user.id, body);
  }
}
