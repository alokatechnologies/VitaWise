import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface NutritionLogDto {
  mealType: 'breakfast' | 'lunch' | 'snack' | 'dinner';
  foodName: string;
  portionDescription?: string;
  estimatedCalories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  glycemicIndexLevel?: 'low' | 'medium' | 'high';
}

export interface SymptomLogDto {
  symptomCategory: 'pcos' | 'digestive' | 'energy' | 'pain' | 'mood' | 'skin' | 'sleep';
  symptomName: string;
  severity: number; // 1 to 5
  notes?: string;
}

export interface CycleLogDto {
  periodStartDate?: string;
  periodEndDate?: string;
  durationDays?: number;
  cycleDay?: number;
  flowIntensity?: 'spotting' | 'light' | 'medium' | 'heavy' | 'none';
  cervicalMucus?: string;
  crampsSeverity?: number; // 0 to 5
  basalBodyTempC?: number;
  mood?: string;
  notes?: string;
}

export interface GoalDto {
  goalType: 'pcos_management' | 'weight_loss' | 'nutrition_balance' | 'cycle_regularity' | 'stress_reduction' | 'general_wellness';
  title: string;
  targetMetric: string;
  targetValue: number;
  currentValue?: number;
  unit: string;
  targetDate?: string;
}

export interface SyncDto {
  deviceId: string;
  clientPlatform: 'android' | 'web';
  syncType: 'full' | 'delta';
  lastSyncTimestamp?: string;
}

@Injectable()
export class ClinicalService {
  private readonly logger = new Logger(ClinicalService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Nutrition Log into Supabase PostgreSQL
   */
  async addNutritionLog(userId: string, dto: NutritionLogDto) {
    if (!dto.foodName || !dto.mealType) {
      throw new BadRequestException('foodName and mealType are required');
    }

    const query = `
      INSERT INTO public.nutrition_logs (
        user_id, meal_type, food_name, portion_description,
        estimated_calories, protein_g, carbs_g, fat_g, fiber_g, glycemic_index_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;

    const res = await this.databaseService.query(query, [
      userId,
      dto.mealType,
      dto.foodName,
      dto.portionDescription || null,
      dto.estimatedCalories || 0,
      dto.proteinG || 0,
      dto.carbsG || 0,
      dto.fatG || 0,
      dto.fiberG || 0,
      dto.glycemicIndexLevel || 'medium',
    ]);

    this.logger.log(`Added nutrition log for user ${userId}: ${dto.foodName}`);
    return { success: true, data: res.rows[0] };
  }

  async getNutritionLogs(userId: string, limit = 50) {
    const query = `
      SELECT * FROM public.nutrition_logs
      WHERE user_id = $1
      ORDER BY logged_at DESC
      LIMIT $2;
    `;
    const res = await this.databaseService.query(query, [userId, limit]);
    return { count: res.rows.length, logs: res.rows };
  }

  /**
   * Symptom Log into Supabase PostgreSQL
   */
  async addSymptomLog(userId: string, dto: SymptomLogDto) {
    if (!dto.symptomCategory || !dto.symptomName || !dto.severity) {
      throw new BadRequestException('symptomCategory, symptomName, and severity (1-5) are required');
    }

    const query = `
      INSERT INTO public.symptom_logs (
        user_id, symptom_category, symptom_name, severity, notes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const res = await this.databaseService.query(query, [
      userId,
      dto.symptomCategory,
      dto.symptomName,
      Math.min(5, Math.max(1, dto.severity)),
      dto.notes || null,
    ]);

    return { success: true, data: res.rows[0] };
  }

  async getSymptomLogs(userId: string, limit = 50) {
    const query = `
      SELECT * FROM public.symptom_logs
      WHERE user_id = $1
      ORDER BY logged_at DESC
      LIMIT $2;
    `;
    const res = await this.databaseService.query(query, [userId, limit]);
    return { count: res.rows.length, logs: res.rows };
  }

  /**
   * Cycle Log into Supabase PostgreSQL
   */
  async addCycleLog(userId: string, dto: CycleLogDto) {
    const query = `
      INSERT INTO public.cycle_logs (
        user_id, period_start_date, period_end_date, duration_days,
        cycle_day, flow_intensity, cervical_mucus, cramps_severity,
        basal_body_temp_c, mood, notes
      ) VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const res = await this.databaseService.query(query, [
      userId,
      dto.periodStartDate || null,
      dto.periodEndDate || null,
      dto.durationDays || null,
      dto.cycleDay || null,
      dto.flowIntensity || 'none',
      dto.cervicalMucus || null,
      dto.crampsSeverity ?? 0,
      dto.basalBodyTempC || null,
      dto.mood || null,
      dto.notes || null,
    ]);

    return { success: true, data: res.rows[0] };
  }

  async getCycleLogs(userId: string, limit = 50) {
    const query = `
      SELECT * FROM public.cycle_logs
      WHERE user_id = $1
      ORDER BY logged_at DESC
      LIMIT $2;
    `;
    const res = await this.databaseService.query(query, [userId, limit]);
    return { count: res.rows.length, logs: res.rows };
  }

  /**
   * Goals
   */
  async createGoal(userId: string, dto: GoalDto) {
    const query = `
      INSERT INTO public.goals (
        user_id, goal_type, title, target_metric, target_value, current_value, unit, target_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const res = await this.databaseService.query(query, [
      userId,
      dto.goalType,
      dto.title,
      dto.targetMetric,
      dto.targetValue,
      dto.currentValue || 0.0,
      dto.unit,
      dto.targetDate || null,
    ]);
    return { success: true, data: res.rows[0] };
  }

  async getGoals(userId: string) {
    const query = `
      SELECT * FROM public.goals
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;
    const res = await this.databaseService.query(query, [userId]);
    return { count: res.rows.length, goals: res.rows };
  }

  /**
   * Multi-Device Synchronization (Android <-> Web)
   */
  async syncDevice(userId: string, dto: SyncDto) {
    const since = dto.lastSyncTimestamp ? new Date(dto.lastSyncTimestamp) : new Date(0);

    const [nutrition, symptoms, cycles, goals] = await Promise.all([
      this.databaseService.query(
        `SELECT * FROM public.nutrition_logs WHERE user_id = $1 AND (created_at > $2 OR logged_at > $2) ORDER BY logged_at DESC LIMIT 100`,
        [userId, since]
      ),
      this.databaseService.query(
        `SELECT * FROM public.symptom_logs WHERE user_id = $1 AND (created_at > $2 OR logged_at > $2) ORDER BY logged_at DESC LIMIT 100`,
        [userId, since]
      ),
      this.databaseService.query(
        `SELECT * FROM public.cycle_logs WHERE user_id = $1 AND (created_at > $2 OR logged_at > $2) ORDER BY logged_at DESC LIMIT 100`,
        [userId, since]
      ),
      this.databaseService.query(
        `SELECT * FROM public.goals WHERE user_id = $1 AND updated_at > $2 ORDER BY created_at DESC LIMIT 100`,
        [userId, since]
      ),
    ]);

    // Record sync operation in public.sync_operations
    await this.databaseService.query(
      `INSERT INTO public.sync_operations (
         user_id, device_id, client_platform, sync_type, entities_synced, status, completed_at
       ) VALUES ($1, $2, $3, $4, $5, 'completed', now())`,
      [
        userId,
        dto.deviceId,
        dto.clientPlatform,
        dto.syncType,
        JSON.stringify([
          { entity: 'nutrition_logs', count: nutrition.rows.length },
          { entity: 'symptom_logs', count: symptoms.rows.length },
          { entity: 'cycle_logs', count: cycles.rows.length },
          { entity: 'goals', count: goals.rows.length },
        ]),
      ]
    );

    return {
      syncedAt: new Date().toISOString(),
      platform: dto.clientPlatform,
      sourceOfTruth: 'Supabase PostgreSQL (zvxqvelosmswdwntnpbe)',
      payload: {
        nutritionLogs: nutrition.rows,
        symptomLogs: symptoms.rows,
        cycleLogs: cycles.rows,
        goals: goals.rows,
      },
    };
  }
}
