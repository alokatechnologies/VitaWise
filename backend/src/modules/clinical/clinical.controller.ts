import { Controller, Post, Get, Body, UseGuards, Req, Query } from '@nestjs/common';
import { ClinicalService, NutritionLogDto, SymptomLogDto, CycleLogDto, GoalDto, SyncDto } from './clinical.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';

@Controller('api/v1/health')
@UseGuards(SupabaseAuthGuard)
export class ClinicalController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @Post('nutrition-logs')
  async addNutritionLog(@Req() req: any, @Body() dto: NutritionLogDto) {
    return this.clinicalService.addNutritionLog(req.user.id, dto);
  }

  @Get('nutrition-logs')
  async getNutritionLogs(@Req() req: any, @Query('limit') limit?: string) {
    return this.clinicalService.getNutritionLogs(req.user.id, limit ? parseInt(limit, 10) : 50);
  }

  @Post('symptom-logs')
  async addSymptomLog(@Req() req: any, @Body() dto: SymptomLogDto) {
    return this.clinicalService.addSymptomLog(req.user.id, dto);
  }

  @Get('symptom-logs')
  async getSymptomLogs(@Req() req: any, @Query('limit') limit?: string) {
    return this.clinicalService.getSymptomLogs(req.user.id, limit ? parseInt(limit, 10) : 50);
  }

  @Post('cycle-logs')
  async addCycleLog(@Req() req: any, @Body() dto: CycleLogDto) {
    return this.clinicalService.addCycleLog(req.user.id, dto);
  }

  @Get('cycle-logs')
  async getCycleLogs(@Req() req: any, @Query('limit') limit?: string) {
    return this.clinicalService.getCycleLogs(req.user.id, limit ? parseInt(limit, 10) : 50);
  }

  @Post('goals')
  async createGoal(@Req() req: any, @Body() dto: GoalDto) {
    return this.clinicalService.createGoal(req.user.id, dto);
  }

  @Get('goals')
  async getGoals(@Req() req: any) {
    return this.clinicalService.getGoals(req.user.id);
  }

  @Post('sync')
  async syncDevice(@Req() req: any, @Body() dto: SyncDto) {
    return this.clinicalService.syncDevice(req.user.id, dto);
  }
}
