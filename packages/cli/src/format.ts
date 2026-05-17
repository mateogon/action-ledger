import type { ProjectRecord, TaskRecord } from "@action-ledger/core";

export function taskSummary(task: TaskRecord): Record<string, unknown> {
  return {
    id: task.metadata.id,
    title: task.metadata.title,
    area: task.metadata.area,
    project: task.metadata.project,
    status: task.metadata.status,
    priority: task.metadata.priority,
    due: task.metadata.due,
    tags: task.metadata.tags,
    reminder: task.metadata.reminder,
    claim: task.metadata.claim,
    source_links: task.metadata.source_links,
    path: task.path
  };
}

export function projectSummary(project: ProjectRecord): Record<string, unknown> {
  return {
    id: project.metadata.id,
    title: project.metadata.title,
    area: project.metadata.area,
    status: project.metadata.status,
    priority: project.metadata.priority,
    source_links: project.metadata.source_links,
    path: project.path
  };
}

export function table(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "(none)";
  const keys = Object.keys(rows[0] ?? {});
  return rows
    .map((row) => keys.map((key) => `${key}=${String(row[key] ?? "")}`).join("  "))
    .join("\n");
}
