-- VitaWise Migration 004: AI Domain
-- ai_assessments, ai_recommendations, risk_scores, model_outputs

CREATE TABLE IF NOT EXISTS public.ai_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('pcos_risk', 'nutrition_audit', 'metabolic_health', 'cycle_regularity', 'wellness_summary')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'moderate', 'elevated', 'high')),
  confidence_score NUMERIC(4,3) NOT NULL,
  clinical_indicators JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.ai_assessments(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN ('diet', 'lifestyle', 'clinical_consult', 'supplement', 'exercise')),
  title TEXT NOT NULL,
  action_item TEXT NOT NULL,
  scientific_rationale TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score_type TEXT NOT NULL,
  numeric_score NUMERIC(5,2) NOT NULL,
  percentile NUMERIC(5,2),
  explanation TEXT NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.model_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  prompt_type TEXT NOT NULL,
  model_version TEXT NOT NULL,
  inference_duration_ms INT,
  token_usage JSONB DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_assessments_user_id ON public.ai_assessments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_user_id ON public.ai_recommendations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_risk_scores_user_id ON public.risk_scores(user_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_outputs_user_id ON public.model_outputs(user_id, created_at DESC);
