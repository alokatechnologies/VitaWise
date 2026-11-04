-- VitaWise Migration 011: Family Health & Privacy Domain
-- families, family_memberships, family_access_requests, family_permissions, and RLS policies

-- 1. Create Families Table
CREATE TABLE IF NOT EXISTS public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'My Family',
  admin_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create Family Memberships Table
CREATE TABLE IF NOT EXISTS public.family_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  relationship TEXT NOT NULL DEFAULT 'other' CHECK (relationship IN ('father', 'mother', 'husband', 'wife', 'son', 'daughter', 'brother', 'sister', 'other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(family_id, user_id)
);

-- 3. Create Family Access Requests Table
CREATE TABLE IF NOT EXISTS public.family_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'granted', 'denied', 'revoked')),
  requested_categories JSONB NOT NULL DEFAULT '["pcos_overview", "cycle_period", "symptoms_journal", "hormonal_wellness", "medication", "lab_records", "private_health_history"]'::jsonb,
  notes TEXT DEFAULT '',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- 4. Create Granular Family Permissions Table
CREATE TABLE IF NOT EXISTS public.family_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pcos_overview BOOLEAN NOT NULL DEFAULT false,
  cycle_period BOOLEAN NOT NULL DEFAULT false,
  symptoms_journal BOOLEAN NOT NULL DEFAULT false,
  hormonal_wellness BOOLEAN NOT NULL DEFAULT false,
  medication BOOLEAN NOT NULL DEFAULT false,
  lab_records BOOLEAN NOT NULL DEFAULT false,
  private_health_history BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(family_id, member_user_id, admin_user_id)
);

-- 5. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_families_admin ON public.families(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_family_memberships_family ON public.family_memberships(family_id);
CREATE INDEX IF NOT EXISTS idx_family_memberships_user ON public.family_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_family_access_requests_target ON public.family_access_requests(target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_family_access_requests_requester ON public.family_access_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_family_permissions_lookup ON public.family_permissions(family_id, member_user_id, admin_user_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_permissions ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DROP POLICY IF EXISTS "Family members can view their own family" ON public.families;
CREATE POLICY "Family members can view their own family" ON public.families
  FOR SELECT USING (
    admin_user_id = auth.uid() OR
    id IN (SELECT family_id FROM public.family_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Family admin can update family" ON public.families;
CREATE POLICY "Family admin can update family" ON public.families
  FOR UPDATE USING (admin_user_id = auth.uid());

DROP POLICY IF EXISTS "Family members can view memberships in same family" ON public.family_memberships;
CREATE POLICY "Family members can view memberships in same family" ON public.family_memberships
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM public.family_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view and respond to access requests targeting them or sent by them" ON public.family_access_requests;
CREATE POLICY "Users can view and respond to access requests targeting them or sent by them" ON public.family_access_requests
  FOR ALL USING (target_user_id = auth.uid() OR requester_id = auth.uid());

DROP POLICY IF EXISTS "Users can view and manage their own granted permissions" ON public.family_permissions;
CREATE POLICY "Users can view and manage their own granted permissions" ON public.family_permissions
  FOR ALL USING (member_user_id = auth.uid() OR admin_user_id = auth.uid());

GRANT ALL ON public.families TO anon, authenticated, service_role;
GRANT ALL ON public.family_memberships TO anon, authenticated, service_role;
GRANT ALL ON public.family_access_requests TO anon, authenticated, service_role;
GRANT ALL ON public.family_permissions TO anon, authenticated, service_role;
