-- VitaWise Migration 003: Goals and Health Domain
-- goals, health_records, symptom_logs, nutrition_logs, activity_logs, measurements, cycle_logs

CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('pcos_management', 'weight_loss', 'nutrition_balance', 'cycle_regularity', 'stress_reduction', 'general_wellness')),
  title TEXT NOT NULL,
  target_metric TEXT NOT NULL,
  target_value NUMERIC(10,2) NOT NULL,
  current_value NUMERIC(10,2) NOT NULL DEFAULT 0.0,
  unit TEXT NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'paused', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('lab_report', 'clinical_note', 'prescription', 'doctor_summary', 'ultrasound')),
  title TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_url TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.symptom_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symptom_category TEXT NOT NULL CHECK (symptom_category IN ('pcos', 'digestive', 'energy', 'pain', 'mood', 'skin', 'sleep')),
  symptom_name TEXT NOT NULL,
  severity INT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nutrition_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'snack', 'dinner')),
  food_name TEXT NOT NULL,
  portion_description TEXT,
  estimated_calories NUMERIC(7,2) NOT NULL DEFAULT 0,
  protein_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  carbs_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  fat_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  fiber_g NUMERIC(6,2) NOT NULL DEFAULT 0,
  glycemic_index_level TEXT CHECK (glycemic_index_level IN ('low', 'medium', 'high')),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('walking', 'yoga', 'cycling', 'strength', 'swimming', 'aerobics', 'running', 'other')),
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  intensity TEXT NOT NULL CHECK (intensity IN ('low', 'medium', 'high')),
  calories_burned NUMERIC(7,2) NOT NULL DEFAULT 0,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('weight_kg', 'blood_glucose_fasting', 'blood_glucose_postprandial', 'blood_pressure_systolic', 'blood_pressure_diastolic', 'hba1c', 'waist_cm', 'bmi')),
  value NUMERIC(8,2) NOT NULL,
  unit TEXT NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cycle_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cycle_day INT CHECK (cycle_day > 0),
  flow_intensity TEXT CHECK (flow_intensity IN ('spotting', 'light', 'medium', 'heavy', 'none')),
  cervical_mucus TEXT,
  cramps_severity INT CHECK (cramps_severity BETWEEN 0 AND 5),
  basal_body_temp_c NUMERIC(4,2),
  mood TEXT,
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_health_records_user_id ON public.health_records(user_id);
CREATE INDEX IF NOT EXISTS idx_symptom_logs_user_date ON public.symptom_logs(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date ON public.nutrition_logs(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date ON public.activity_logs(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_user_metric ON public.measurements(user_id, metric_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_cycle_logs_user_date ON public.cycle_logs(user_id, logged_at DESC);
