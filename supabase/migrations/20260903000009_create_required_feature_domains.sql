-- VitaWise Migration 009: Required feature domains
-- Additive tables for reminders, journals, reports, scans, plans, and achievements.

CREATE TABLE IF NOT EXISTS public.medicine_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  reminder_time TIME NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.medicine_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id UUID NOT NULL REFERENCES public.medicine_reminders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  taken_on DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK (status IN ('taken', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.skin_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  severity INT CHECK (severity BETWEEN 1 AND 5),
  notes TEXT,
  recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.food_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  image_path TEXT,
  scan_type TEXT NOT NULL CHECK (scan_type IN ('food', 'packaged_food', 'barcode', 'unsupported')),
  detected_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  nutrition JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exercise_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  duration_minutes INT,
  sets INT,
  repetitions INT,
  difficulty TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'skipped')),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meal_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'snack', 'dinner')),
  reminder_time TIME NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, meal_type)
);

CREATE TABLE IF NOT EXISTS public.water_settings (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  daily_target_ml INT NOT NULL DEFAULT 2000,
  reminder_interval_minutes INT,
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal_mode TEXT NOT NULL,
  plan_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wellness_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  progress NUMERIC(5,2) NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS idx_medicine_reminders_user ON public.medicine_reminders(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_medicine_logs_user_date ON public.medicine_logs(user_id, taken_on DESC);
CREATE INDEX IF NOT EXISTS idx_skin_journal_user_date ON public.skin_journal_entries(user_id, recorded_on DESC);
CREATE INDEX IF NOT EXISTS idx_food_scans_user_date ON public.food_scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_user_date ON public.exercise_logs(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_reminders_user ON public.meal_reminders(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user ON public.meal_plans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_user_period ON public.wellness_reports(user_id, report_type, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_achievements_user ON public.achievements(user_id, unlocked_at DESC);

ALTER TABLE public.medicine_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skin_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medicine_reminders_self_manage" ON public.medicine_reminders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "medicine_logs_self_manage" ON public.medicine_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "skin_journal_self_manage" ON public.skin_journal_entries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "food_scans_self_manage" ON public.food_scans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "exercise_logs_self_manage" ON public.exercise_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meal_reminders_self_manage" ON public.meal_reminders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "water_settings_self_manage" ON public.water_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meal_plans_self_manage" ON public.meal_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wellness_reports_self_read" ON public.wellness_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "achievements_self_manage" ON public.achievements FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
