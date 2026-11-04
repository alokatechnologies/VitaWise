-- =====================================================================
-- VitaWise Complete Supabase Database Setup & Auto-Sync Triggers
-- Copy and paste this whole script into your Supabase SQL Editor:
-- Dashboard: https://supabase.com/dashboard -> Select Project -> SQL Editor
-- =====================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create Public Users Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'doctor', 'nutritionist', 'admin')),
  full_name TEXT DEFAULT '',
  password TEXT,
  password_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create Public User Profiles Table
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

-- 4. Create Public User Preferences Table
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

-- 5. Auto-sync Auth Users to Public Tables via PostgreSQL Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'role', 'patient')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.users.full_name);

  INSERT INTO public.user_profiles (user_id, gender, language_preference)
  VALUES (NEW.id, 'female', 'en')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate Trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Enable Row Level Security (RLS) & Grant Table Permissions
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public users full access" ON public.users;
CREATE POLICY "Public users full access" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public profiles full access" ON public.user_profiles;
CREATE POLICY "Public profiles full access" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public preferences full access" ON public.user_preferences;
CREATE POLICY "Public preferences full access" ON public.user_preferences FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.users TO anon, authenticated, service_role;
GRANT ALL ON public.user_profiles TO anon, authenticated, service_role;
GRANT ALL ON public.user_preferences TO anon, authenticated, service_role;
