-- VitaWise Migration 005: Knowledge & Content Domain
-- content, content_versions, knowledge_sources, knowledge_chunks (pgvector)

CREATE TABLE IF NOT EXISTS public.content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('pcos_education', 'telugu_nutrition', 'ayurvedic_evidence', 'clinical_guidelines', 'lifestyle')),
  title_en TEXT NOT NULL,
  title_te TEXT,
  summary_en TEXT NOT NULL,
  summary_te TEXT,
  body_markdown TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  published BOOLEAN NOT NULL DEFAULT true,
  author TEXT NOT NULL DEFAULT 'VitaWise Clinical Board',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  changelog TEXT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('clinical_guideline', 'icmr_nin_dietary_guideline', 'peer_reviewed_paper', 'institutional_doc')),
  citation TEXT NOT NULL,
  trust_score NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding extensions.vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_category ON public.content(category, published);
CREATE INDEX IF NOT EXISTS idx_content_slug ON public.content(slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_id ON public.knowledge_chunks(source_id);
