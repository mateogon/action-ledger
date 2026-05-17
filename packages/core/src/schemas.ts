import { z } from "zod";

export const TASK_STATUSES = ["inbox", "next", "doing", "waiting", "done"] as const;
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const AREAS = ["work", "learning", "personal", "media", "admin", "extra", "other"] as const;
export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;

export const ReminderSchema = z.object({
  enabled: z.boolean().default(false),
  apple_id: z.string().nullable().default(null)
});

export const TaskClaimSchema = z
  .object({
    owner: z.string().min(1),
    at: z.string().min(1)
  })
  .nullable()
  .default(null);

export const TaskFrontmatterSchema = z.object({
  schema_version: z.number().int().positive().default(1),
  id: z.string().min(1),
  title: z.string().min(1),
  area: z.enum(AREAS).default("other"),
  project: z.string().nullable().default(null),
  status: z.enum(TASK_STATUSES).default("inbox"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  due: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  reminder: ReminderSchema.default({ enabled: false, apple_id: null }),
  claim: TaskClaimSchema,
  source_links: z.array(z.string()).default([]),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  completed_at: z.string().nullable().default(null),
  archived_at: z.string().nullable().default(null)
});

export const ProjectFrontmatterSchema = z.object({
  schema_version: z.number().int().positive().default(1),
  id: z.string().min(1),
  title: z.string().min(1),
  area: z.enum(AREAS).default("other"),
  status: z.enum(PROJECT_STATUSES).default("active"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  source_links: z.array(z.string()).default([]),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  archived_at: z.string().nullable().default(null)
});

export const WorkspaceConfigSchema = z.object({
  data_dir: z.string().min(1),
  reminders: z
    .object({
      enabled: z.boolean().default(false),
      list_name: z.string().min(1).default("Action Ledger")
    })
    .default({ enabled: false, list_name: "Action Ledger" }),
  desktop: z
    .object({
      autostart: z.boolean().default(false)
    })
    .default({ autostart: false })
});

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type Area = (typeof AREAS)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
