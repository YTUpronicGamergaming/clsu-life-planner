PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS planner_tasks (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  task_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  category TEXT NOT NULL DEFAULT 'Personal',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  CHECK((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time))
);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_schedule_date ON planner_tasks(schedule_id, task_date, start_time);
