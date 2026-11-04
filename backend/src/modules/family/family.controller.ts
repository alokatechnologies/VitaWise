import { Controller, Post, Get, Body, Param, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { FamilyService, CreateFamilyDto, AddMemberDto } from './family.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';

@Controller('api/v1/family')
@UseGuards(SupabaseAuthGuard)
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createFamily(@Req() req: any, @Body() dto: CreateFamilyDto) {
    return this.familyService.createFamily(req.user.id, dto);
  }

  @Get()
  async getFamily(@Req() req: any) {
    return this.familyService.getFamily(req.user.id);
  }

  @Get('dashboard')
  async getFamilyDashboard(@Req() req: any) {
    return this.familyService.getFamilyDashboard(req.user.id);
  }

  @Get('member/:memberId')
  async getMemberDetails(@Req() req: any, @Param('memberId') memberId: string) {
    return this.familyService.getMemberDetails(req.user.id, memberId);
  }

  @Post('members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(@Req() req: any, @Body() dto: AddMemberDto) {
    return this.familyService.addMember(req.user.id, dto);
  }

  @Post('access-request')
  @HttpCode(HttpStatus.OK)
  async requestAccess(
    @Req() req: any,
    @Body('targetUserId') targetUserId: string,
    @Body('notes') notes?: string,
  ) {
    return this.familyService.requestAccess(req.user.id, targetUserId, notes);
  }

  @Post('access-request/:requestId/respond')
  @HttpCode(HttpStatus.OK)
  async respondAccessRequest(
    @Req() req: any,
    @Param('requestId') requestId: string,
    @Body('status') status: 'granted' | 'denied',
    @Body('permissions') permissions?: any,
  ) {
    return this.familyService.respondAccessRequest(req.user.id, requestId, status, permissions);
  }
}
