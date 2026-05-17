import { invoke } from "@tauri-apps/api/core";
import type { ProjectRecord, TaskInput, TaskRecord, TaskStatus, WorkspaceStatus } from "./types";

export async function getWorkspaceStatus(): Promise<WorkspaceStatus> {
  return invoke("get_workspace_status");
}

export async function listTasks(): Promise<TaskRecord[]> {
  return invoke("list_tasks");
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return invoke("list_projects");
}

export async function createTask(input: TaskInput): Promise<TaskRecord> {
  return invoke("create_task", { input });
}

export async function moveTask(id: string, status: TaskStatus): Promise<TaskRecord> {
  return invoke("move_task", { id, status });
}

export async function completeTask(id: string): Promise<TaskRecord> {
  return invoke("complete_task", { id });
}

export async function archiveTask(id: string): Promise<TaskRecord> {
  return invoke("archive_task", { id });
}

export async function deleteTask(id: string): Promise<string> {
  return invoke("delete_task", { id, confirm: true });
}

export async function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}

export async function openDataDir(): Promise<void> {
  return invoke("open_data_dir");
}
