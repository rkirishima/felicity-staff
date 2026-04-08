# Attendance Table Setup Guide

## Current Implementation Status

The staff app now correctly:
- ✅ Records clock_in data to `timeclock` table
- ✅ Records clock_out data to `timeclock` table
- ✅ Displays accurate worked hours (end_time - start_time)
- ✅ JOINs shifts table to show scheduled times vs actual clock times
- ✅ Calculates compensation based on actual worked hours

## How It Works

### Clock In/Out Flow
1. **Clock In**: Inserts record with `staff_id`, `clock_in` timestamp, and optional `shift_id`
2. **Clock Out**: Updates the same record, setting `clock_out` timestamp
3. **Dashboard**: Queries timeclock with shifts JOIN to show:
   - Actual clock times (実績)
   - Scheduled shift times (シフト)
   - Total hours worked and compensation

### Data Structure

```
timeclock
├── id (uuid)
├── staff_id (uuid) → staff.id
├── clock_in (timestamptz)
├── clock_out (timestamptz)
├── shift_id (uuid) → shifts.id [optional]
├── note (text)
├── created_at (timestamptz)

shifts
├── id (uuid)
├── staff_id (uuid) → staff.id
├── date (date)
├── start_time (time)
├── end_time (time)
├── status (text)
└── ...
```

## Optional: Migrate to Dedicated `attendance` Table

To create a separate `attendance` table (for audit/compliance reasons), run the following SQL in Supabase SQL Editor:

```sql
-- Run migrations/001_create_attendance.sql in Supabase
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

CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON public.attendance(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_staff ON public.attendance(staff_id);
```

Then update `app/page.tsx` to replace `from('timeclock')` with `from('attendance')` in the relevant functions.

## Testing

1. **Local**: `npm run dev` → visit http://localhost:3000
2. **Select staff** → Enter PIN
3. **Clock In** → Verify timeclock record created in Supabase
4. **Clock Out** → Verify timeclock record updated
5. **Dashboard** → Verify stats show correct hours and compensation

## Vercel Deployment

```bash
git add -A
git commit -m "fix: Correct timeclock/attendance JOINing and hour calculations"
git push origin main
npx vercel --prod
```

Verify at production URL that clock in/out works and dashboard displays correct data.
