-- Create attendance table if not exists
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON public.attendance(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_staff ON public.attendance(staff_id);

-- Set up RLS if needed
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Allow staff to view their own attendance
CREATE POLICY "Staff can view own attendance"
  ON public.attendance
  FOR SELECT
  USING (staff_id = auth.uid());

-- Allow authenticated users with staff role to insert/update
CREATE POLICY "Staff can manage own attendance"
  ON public.attendance
  FOR INSERT
  WITH CHECK (staff_id = auth.uid());

CREATE POLICY "Staff can update own attendance"
  ON public.attendance
  FOR UPDATE
  USING (staff_id = auth.uid());
