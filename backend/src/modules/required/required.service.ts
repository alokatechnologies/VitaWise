import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class RequiredService {
  constructor(private readonly database: DatabaseService) {}

  async listMedicineReminders(userId: string) {
    const result = await this.database.query('SELECT * FROM public.medicine_reminders WHERE user_id = $1 ORDER BY reminder_time', [userId]);
    return { reminders: result.rows };
  }

  async createMedicineReminder(userId: string, body: any) {
    if (!body.medicineName || !body.dosage || !body.reminderTime) throw new BadRequestException('medicineName, dosage, and reminderTime are required');
    const result = await this.database.query(
      `INSERT INTO public.medicine_reminders (user_id, medicine_name, dosage, reminder_time, frequency, start_date, end_date, enabled)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7::date, COALESCE($8, true)) RETURNING *`,
      [userId, body.medicineName, body.dosage, body.reminderTime, body.frequency || 'daily', body.startDate || null, body.endDate || null, body.enabled]
    );
    return { success: true, reminder: result.rows[0] };
  }

  async logMedicine(userId: string, reminderId: string, status: 'taken' | 'skipped') {
    if (!['taken', 'skipped'].includes(status)) throw new BadRequestException('status must be taken or skipped');
    const result = await this.database.query(
      `INSERT INTO public.medicine_logs (reminder_id, user_id, status) SELECT id, $1, $3 FROM public.medicine_reminders WHERE id = $2 AND user_id = $1 RETURNING *`,
      [userId, reminderId, status]
    );
    if (!result.rows[0]) throw new BadRequestException('Reminder not found');
    return { success: true, log: result.rows[0] };
  }

  async listSkinEntries(userId: string) {
    const result = await this.database.query('SELECT * FROM public.skin_journal_entries WHERE user_id = $1 ORDER BY recorded_on DESC, created_at DESC', [userId]);
    return { entries: result.rows };
  }

  async createSkinEntry(userId: string, body: any) {
    if (!body.storagePath) throw new BadRequestException('storagePath is required');
    const result = await this.database.query(
      `INSERT INTO public.skin_journal_entries (user_id, storage_path, severity, notes, recorded_on) VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE)) RETURNING *`,
      [userId, body.storagePath, body.severity || null, body.notes || null, body.recordedOn || null]
    );
    return { success: true, entry: result.rows[0] };
  }

  async listFoodScans(userId: string) {
    const result = await this.database.query('SELECT * FROM public.food_scans WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return { scans: result.rows };
  }

  async createFoodScan(userId: string, body: any) {
    const allowed = ['food', 'packaged_food', 'barcode', 'unsupported'];
    if (!allowed.includes(body.scanType)) throw new BadRequestException('scanType is invalid');
    const result = await this.database.query(
      `INSERT INTO public.food_scans (user_id, image_path, scan_type, detected_items, nutrition, confirmed) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, COALESCE($6, false)) RETURNING *`,
      [userId, body.imagePath || null, body.scanType, JSON.stringify(body.detectedItems || []), JSON.stringify(body.nutrition || {}), body.confirmed]
    );
    return { success: true, scan: result.rows[0] };
  }

  async listExerciseLogs(userId: string) {
    const result = await this.database.query('SELECT * FROM public.exercise_logs WHERE user_id = $1 ORDER BY logged_at DESC', [userId]);
    return { logs: result.rows };
  }

  async createExerciseLog(userId: string, body: any) {
    if (!body.exerciseName) throw new BadRequestException('exerciseName is required');
    const result = await this.database.query(
      `INSERT INTO public.exercise_logs (user_id, exercise_name, duration_minutes, sets, repetitions, difficulty, status) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'completed')) RETURNING *`,
      [userId, body.exerciseName, body.durationMinutes || null, body.sets || null, body.repetitions || null, body.difficulty || null, body.status]
    );
    return { success: true, log: result.rows[0] };
  }

  async getWaterSettings(userId: string) {
    const result = await this.database.query('SELECT * FROM public.water_settings WHERE user_id = $1', [userId]);
    return { settings: result.rows[0] || null };
  }

  async saveWaterSettings(userId: string, body: any) {
    const result = await this.database.query(
      `INSERT INTO public.water_settings (user_id, daily_target_ml, reminder_interval_minutes, reminders_enabled) VALUES ($1, COALESCE($2, 2000), $3, COALESCE($4, true))
       ON CONFLICT (user_id) DO UPDATE SET daily_target_ml = EXCLUDED.daily_target_ml, reminder_interval_minutes = EXCLUDED.reminder_interval_minutes, reminders_enabled = EXCLUDED.reminders_enabled, updated_at = now() RETURNING *`,
      [userId, body.dailyTargetMl, body.reminderIntervalMinutes || null, body.remindersEnabled]
    );
    return { success: true, settings: result.rows[0] };
  }

  async listMealReminders(userId: string) {
    const result = await this.database.query('SELECT * FROM public.meal_reminders WHERE user_id = $1 ORDER BY meal_type', [userId]);
    return { reminders: result.rows };
  }

  async saveMealReminder(userId: string, body: any) {
    if (!['breakfast', 'lunch', 'snack', 'dinner'].includes(body.mealType) || !body.reminderTime) throw new BadRequestException('mealType and reminderTime are required');
    const result = await this.database.query(
      `INSERT INTO public.meal_reminders (user_id, meal_type, reminder_time, enabled) VALUES ($1, $2, $3, COALESCE($4, true))
       ON CONFLICT (user_id, meal_type) DO UPDATE SET reminder_time = EXCLUDED.reminder_time, enabled = EXCLUDED.enabled RETURNING *`,
      [userId, body.mealType, body.reminderTime, body.enabled]
    );
    return { success: true, reminder: result.rows[0] };
  }

  async createMealPlan(userId: string, body: any) {
    if (!body.goalMode) throw new BadRequestException('goalMode is required');
    const result = await this.database.query('INSERT INTO public.meal_plans (user_id, goal_mode, plan_data, status) VALUES ($1, $2, $3::jsonb, COALESCE($4, \'active\')) RETURNING *', [userId, body.goalMode, JSON.stringify(body.planData || {}), body.status]);
    return { success: true, plan: result.rows[0] };
  }

  async listMealPlans(userId: string) {
    const result = await this.database.query('SELECT * FROM public.meal_plans WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return { plans: result.rows };
  }

  async getReports(userId: string, reportType: 'weekly' | 'monthly') {
    const days = reportType === 'monthly' ? 30 : 7;
    const result = await this.database.query(
      `SELECT
        (SELECT COUNT(*) FROM public.nutrition_logs WHERE user_id = $1 AND logged_at >= now() - ($2 * INTERVAL '1 day')) AS nutrition_entries,
        (SELECT COUNT(*) FROM public.symptom_logs WHERE user_id = $1 AND logged_at >= now() - ($2 * INTERVAL '1 day')) AS symptom_entries,
        (SELECT COUNT(*) FROM public.cycle_logs WHERE user_id = $1 AND logged_at >= now() - ($2 * INTERVAL '1 day')) AS cycle_entries,
        (SELECT COUNT(*) FROM public.exercise_logs WHERE user_id = $1 AND logged_at >= now() - ($2 * INTERVAL '1 day')) AS exercise_entries`,
      [userId, days]
    );
    return { reportType, periodDays: days, summary: result.rows[0], hasData: Object.values(result.rows[0] || {}).some(value => Number(value) > 0) };
  }

  async listAchievements(userId: string) {
    const result = await this.database.query('SELECT * FROM public.achievements WHERE user_id = $1 ORDER BY unlocked_at DESC NULLS LAST, achievement_key', [userId]);
    return { achievements: result.rows };
  }
}
