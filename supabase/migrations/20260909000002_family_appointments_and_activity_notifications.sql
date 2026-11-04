-- VitaWise Migration 014: Family Appointments and Activity Notifications
-- Creates public.appointments with RLS policies and indexes for family health platform
-- Adds indexes on notifications for 7-day retention and member query performance

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doctor_name TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL DEFAULT '09:00:00',
  location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  reminder_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for appointments
CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON public.appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_family_id ON public.appointments(family_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date, appointment_time);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated, service_role;
REVOKE ALL ON public.appointments FROM anon;

-- Row Level Security for Appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- 1. Users can manage their own appointments
DROP POLICY IF EXISTS "appointments_self_manage" ON public.appointments;
CREATE POLICY "appointments_self_manage" ON public.appointments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Family Head can view appointments of members within their active family
DROP POLICY IF EXISTS "appointments_family_head_view" ON public.appointments;
CREATE POLICY "appointments_family_head_view" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    family_id IN (
      SELECT f.id FROM public.families f WHERE f.admin_user_id = auth.uid()
      UNION
      SELECT fm.family_id FROM public.family_memberships fm 
      WHERE fm.user_id = auth.uid() AND fm.role IN ('admin', 'family_head') AND fm.status = 'active'
    )
  );

-- 3. Family Head can insert/update appointments for family members in their family
DROP POLICY IF EXISTS "appointments_family_head_manage" ON public.appointments;
CREATE POLICY "appointments_family_head_manage" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    family_id IN (
      SELECT f.id FROM public.families f WHERE f.admin_user_id = auth.uid()
      UNION
      SELECT fm.family_id FROM public.family_memberships fm 
      WHERE fm.user_id = auth.uid() AND fm.role IN ('admin', 'family_head') AND fm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "appointments_family_head_update" ON public.appointments;
CREATE POLICY "appointments_family_head_update" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id OR
    family_id IN (
      SELECT f.id FROM public.families f WHERE f.admin_user_id = auth.uid()
      UNION
      SELECT fm.family_id FROM public.family_memberships fm 
      WHERE fm.user_id = auth.uid() AND fm.role IN ('admin', 'family_head') AND fm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "appointments_family_head_delete" ON public.appointments;
CREATE POLICY "appointments_family_head_delete" ON public.appointments
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    family_id IN (
      SELECT f.id FROM public.families f WHERE f.admin_user_id = auth.uid()
      UNION
      SELECT fm.family_id FROM public.family_memberships fm 
      WHERE fm.user_id = auth.uid() AND fm.role IN ('admin', 'family_head') AND fm.status = 'active'
    )
  );

-- Optimize Notifications for 7-day retention filtering and member search
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
