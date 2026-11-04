-- VitaWise Migration 002: User Domain
-- users, user_profiles, user_preferences

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'doctor', 'nutritionist', 'admin')),
  full_name TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  gender TEXT DEFAULT 'female',
  height_cm NUMERIC(5,2),
  weight_kg NUMERIC(5,2),
  blood_group TEXT,
  pcos_diagnosed BOOLEAN DEFAULT false,
  pcos_phenotype TEXT,
  dietary_preference TEXT DEFAULT 'vegetarian',
  language_preference TEXT NOT NULL DEFAULT 'en' CHECK (language_preference IN ('en', 'te', 'hi')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT true,
  email_digest BOOLEAN DEFAULT false,
  cycle_reminders BOOLEAN DEFAULT true,
  nutrition_reminders BOOLEAN DEFAULT true,
  dark_mode BOOLEAN DEFAULT false,
  locale TEXT DEFAULT 'en-IN',
  telemetry_opt_in BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);
