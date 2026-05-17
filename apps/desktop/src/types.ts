export type TaskStatus = "inbox" | "next" | "doing" | "waiting" | "done";
export type TaskArea = "work" | "learning" | "personal" | "media" | "admin" | "extra" | "other";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface ReminderMeta {
  enabled: boolean;
  apple_id: string | null;
}

export interface TaskRecord {
  schema_version: number;
  id: string;
  title: string;
  area: TaskArea;
  project: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due: string | null;
  tags: string[];
  reminder: ReminderMeta;
  source_links: string[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
  body: string;
  path: string;
}

export interface ProjectRecord {
  schema_version: number;
  id: string;
  title: string;
  area: TaskArea;
  status: string;
  priority: TaskPriority;
  source_links: string[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  body: string;
  path: string;
}

export interface WorkspaceStatus {
  data_dir: string;
  tasks: number;
  projects: number;
}

export interface TaskInput {
  title: string;
  area?: TaskArea;
  project?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due?: string | null;
  tags?: string[];
  reminder_enabled?: boolean;
  source_links?: string[];
  body?: string;
}

export interface Filters {
  area: string;
  project: string;
  search: string;
  dueBefore: string;
  hideDone: boolean;
}
