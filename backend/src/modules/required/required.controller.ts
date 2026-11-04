import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { RequiredService } from './required.service';

@Controller('api/v1/required')
@UseGuards(SupabaseAuthGuard)
export class RequiredController {
  constructor(private readonly required: RequiredService) {}

  @Get('medicine-reminders')
  listMedicine(@Req() req: any) { return this.required.listMedicineReminders(req.user.id); }

  @Post('medicine-reminders')
  createMedicine(@Req() req: any, @Body() body: any) { return this.required.createMedicineReminder(req.user.id, body); }

  @Post('medicine-reminders/:id/log')
  logMedicine(@Req() req: any, @Param('id') id: string, @Body('status') status: 'taken' | 'skipped') { return this.required.logMedicine(req.user.id, id, status); }

  @Get('skin-journal')
  listSkin(@Req() req: any) { return this.required.listSkinEntries(req.user.id); }

  @Post('skin-journal')
  createSkin(@Req() req: any, @Body() body: any) { return this.required.createSkinEntry(req.user.id, body); }

  @Get('food-scans')
  listScans(@Req() req: any) { return this.required.listFoodScans(req.user.id); }

  @Post('food-scans')
  createScan(@Req() req: any, @Body() body: any) { return this.required.createFoodScan(req.user.id, body); }

  @Get('exercise-logs')
  listExercise(@Req() req: any) { return this.required.listExerciseLogs(req.user.id); }

  @Post('exercise-logs')
  createExercise(@Req() req: any, @Body() body: any) { return this.required.createExerciseLog(req.user.id, body); }

  @Get('water-settings')
  getWater(@Req() req: any) { return this.required.getWaterSettings(req.user.id); }

  @Post('water-settings')
  saveWater(@Req() req: any, @Body() body: any) { return this.required.saveWaterSettings(req.user.id, body); }

  @Get('meal-reminders')
  listMealReminders(@Req() req: any) { return this.required.listMealReminders(req.user.id); }

  @Post('meal-reminders')
  saveMealReminder(@Req() req: any, @Body() body: any) { return this.required.saveMealReminder(req.user.id, body); }

  @Get('meal-plans')
  listPlans(@Req() req: any) { return this.required.listMealPlans(req.user.id); }

  @Post('meal-plans')
  createPlan(@Req() req: any, @Body() body: any) { return this.required.createMealPlan(req.user.id, body); }

  @Get('reports')
  reports(@Req() req: any, @Query('type') type: 'weekly' | 'monthly' = 'weekly') { return this.required.getReports(req.user.id, type === 'monthly' ? 'monthly' : 'weekly'); }

  @Get('achievements')
  achievements(@Req() req: any) { return this.required.listAchievements(req.user.id); }
}
