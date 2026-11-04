-- VitaWise Migration 010: Period cycle start/end tracking

ALTER TABLE public.cycle_logs ADD COLUMN IF NOT EXISTS period_start_date DATE;
ALTER TABLE public.cycle_logs ADD COLUMN IF NOT EXISTS period_end_date DATE;
ALTER TABLE public.cycle_logs ADD COLUMN IF NOT EXISTS duration_days INT CHECK (duration_days IS NULL OR duration_days > 0);
