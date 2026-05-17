import {
  appendTaskLog,
  archiveTask,
  claimTask,
  completeTask,
  createProject,
  createTask,
  deleteTask,
  getNextActions,
  getProject,
  getTask,
  getWorkspaceSummary,
  initWorkspace,
  linkTaskSource,
  listProjects,
  listTasks,
  loadConfig,
  moveTask,
  releaseTask,
  searchTasks,
  type Area,
  type TaskPriority,
  type TaskStatus
} from "@action-ledger/core";
import { syncReminders } from "@action-ledger/reminders-sync";

type ToolArgs = Record<string, unknown>;

async function resolveDataDir(args: ToolArgs): Promise<string> {
  if (typeof args.data_dir === "string" && args.data_dir.length > 0) return args.data_dir;
  const config = await loadConfig({
    configPath: typeof args.config_path === "string" ? args.config_path : undefined
  });
  return config.data_dir;
}

export function serializableTask(task: Awaited<ReturnType<typeof getTask>>): Record<string, unknown> {
  return { ...task.metadata, path: task.path, body: task.body };
}

export function compactSerializableTask(task: Awaited<ReturnType<typeof searchTasks>>[number]): Record<string, unknown> {
  return { ...task };
}

export function serializableProject(project: Awaited<ReturnType<typeof createProject>>): Record<string, unknown> {
  return { ...project.metadata, path: project.path, body: project.body };
}

export function createToolHandlers() {
  return {
    async init_workspace(args: ToolArgs) {
      return initWorkspace({
        dataDir: typeof args.data_dir === "string" ? args.data_dir : undefined,
        configPath: typeof args.config_path === "string" ? args.config_path : undefined,
        writeGlobal: typeof args.write_global === "boolean" ? args.write_global : true
      });
    },

    async get_workspace_status(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      const tasks = await listTasks(dataDir);
      const projects = await listProjects(dataDir);
      return { data_dir: dataDir, tasks: tasks.length, projects: projects.length };
    },

    async create_task(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      const task = await createTask(dataDir, {
        title: String(args.title ?? ""),
        area: args.area as Area | undefined,
        project: (args.project as string | null | undefined) ?? null,
        status: args.status as TaskStatus | undefined,
        priority: args.priority as TaskPriority | undefined,
        due: (args.due as string | null | undefined) ?? null,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
        reminder: {
          enabled: Boolean(args.reminder_enabled)
        },
        source_links: Array.isArray(args.source_links) ? args.source_links.map(String) : [],
        body: typeof args.body === "string" ? args.body : "\n"
      });
      return serializableTask(task);
    },

    async list_tasks(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      const tasks = await listTasks(dataDir, {
        status: args.status as TaskStatus | undefined,
        area: args.area as Area | undefined,
        project: typeof args.project === "string" ? args.project : undefined,
        dueBefore: typeof args.due_before === "string" ? args.due_before : undefined
      });
      return tasks.map(serializableTask);
    },

    async search_tasks(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return (
        await searchTasks(dataDir, {
          query: typeof args.query === "string" ? args.query : "",
          status: args.status as TaskStatus | undefined,
          area: args.area as Area | undefined,
          project: typeof args.project === "string" ? args.project : undefined,
          dueBefore: typeof args.due_before === "string" ? args.due_before : undefined,
          limit: typeof args.limit === "number" ? args.limit : undefined
        })
      ).map(compactSerializableTask);
    },

    async get_next_actions(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return (
        await getNextActions(dataDir, {
          area: args.area as Area | undefined,
          project: typeof args.project === "string" ? args.project : undefined,
          limit: typeof args.limit === "number" ? args.limit : undefined
        })
      ).map(compactSerializableTask);
    },

    async get_workspace_summary(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return getWorkspaceSummary(dataDir, {
        today: typeof args.today === "string" ? args.today : undefined,
        dueWithinDays: typeof args.due_within_days === "number" ? args.due_within_days : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined
      });
    },

    async get_task(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableTask(await getTask(dataDir, String(args.id ?? "")));
    },

    async move_task(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableTask(await moveTask(dataDir, String(args.id ?? ""), args.status as TaskStatus));
    },

    async complete_task(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableTask(await completeTask(dataDir, String(args.id ?? "")));
    },

    async archive_task(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableTask(await archiveTask(dataDir, String(args.id ?? "")));
    },

    async delete_task(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return deleteTask(dataDir, String(args.id ?? ""), args.confirm === true);
    },

    async create_project(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableProject(
        await createProject(dataDir, {
          title: String(args.title ?? ""),
          area: args.area as Area | undefined,
          priority: args.priority as TaskPriority | undefined,
          source_links: Array.isArray(args.source_links) ? args.source_links.map(String) : [],
          body: typeof args.body === "string" ? args.body : "\n"
        })
      );
    },

    async list_projects(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return (await listProjects(dataDir)).map(serializableProject);
    },

    async get_project(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableProject(await getProject(dataDir, String(args.id ?? "")));
    },

    async link_source(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableTask(await linkTaskSource(dataDir, String(args.id ?? ""), String(args.source_link ?? "")));
    },

    async append_task_log(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableTask(
        await appendTaskLog(dataDir, String(args.id ?? ""), {
          message: String(args.message ?? ""),
          author: typeof args.author === "string" ? args.author : "Codex",
          at: typeof args.at === "string" ? args.at : undefined
        })
      );
    },

    async claim_task(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableTask(
        await claimTask(dataDir, String(args.id ?? ""), {
          owner: typeof args.owner === "string" ? args.owner : "Codex",
          at: typeof args.at === "string" ? args.at : undefined,
          force: args.force === true
        })
      );
    },

    async release_task(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return serializableTask(
        await releaseTask(dataDir, String(args.id ?? ""), {
          owner: typeof args.owner === "string" ? args.owner : undefined,
          force: args.force === true
        })
      );
    },

    async sync_reminders(args: ToolArgs) {
      const dataDir = await resolveDataDir(args);
      return syncReminders({
        dataDir,
        dryRun: args.dry_run !== false,
        listName: typeof args.list_name === "string" ? args.list_name : undefined
      });
    }
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;
