// Timeclock record type
export interface TimeclockRecord {
  id: string;
  user_id: string;
  staff_name: string;
  clock_in: string | null;
  clock_out: string | null;
  date: string;
  created_at: string;
  updated_at: string;
}

// Schedule request type
export interface ScheduleRequest {
  id: string;
  user_id: string;
  staff_name: string;
  requested_date: string;
  start_time: string;
  end_time: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

// Weekly schedule
export interface WeeklySchedule {
  date: string;
  day: string;
  shift_start?: string;
  shift_end?: string;
  status: 'scheduled' | 'off' | 'pending';
}

// User type
export interface Staff {
  id: string;
  name: string;
  email: string;
  role: 'staff' | 'manager' | 'admin';
  created_at: string;
  updated_at: string;
}
