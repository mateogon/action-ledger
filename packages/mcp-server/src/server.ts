import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getProject, getTask, listProjects, listTasks, loadConfig } from "@action-ledger/core";
import { createToolHandlers } from "./handlers.js";

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

export function createCommandCenterMcpServer(): McpServer {
  const server = new McpServer({
    name: "action-ledger",
    version: "0.1.0"
  });
  const handlers = createToolHandlers();

  server.tool(
    "init_workspace",
    "Initialize a local Action Ledger workspace.",
    {
      data_dir: z.string().optional(),
      config_path: z.string().optional(),
      write_global: z.boolean().optional()
    },
    async (args) => textResult(await handlers.init_workspace(args))
  );

  server.tool("get_workspace_status", { data_dir: z.string().optional(), config_path: z.string().optional() }, async (args) =>
    textResult(await handlers.get_workspace_status(args))
  );

  server.tool(
    "create_task",
    {
      data_dir: z.string().optional(),
      title: z.string(),
      area: z.string().optional(),
      project: z.string().nullable().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      due: z.string().nullable().optional(),
      reminder_enabled: z.boolean().optional(),
      source_links: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      body: z.string().optional()
    },
    async (args) => textResult(await handlers.create_task(args))
  );

  server.tool(
    "list_tasks",
    {
      data_dir: z.string().optional(),
      status: z.string().optional(),
      area: z.string().optional(),
      project: z.string().optional(),
      due_before: z.string().optional()
    },
    async (args) => textResult(await handlers.list_tasks(args))
  );

  server.tool("get_task", { data_dir: z.string().optional(), id: z.string() }, async (args) =>
    textResult(await handlers.get_task(args))
  );
  server.tool("move_task", { data_dir: z.string().optional(), id: z.string(), status: z.string() }, async (args) =>
    textResult(await handlers.move_task(args))
  );
  server.tool("complete_task", { data_dir: z.string().optional(), id: z.string() }, async (args) =>
    textResult(await handlers.complete_task(args))
  );
  server.tool("archive_task", { data_dir: z.string().optional(), id: z.string() }, async (args) =>
    textResult(await handlers.archive_task(args))
  );
  server.tool("delete_task", { data_dir: z.string().optional(), id: z.string(), confirm: z.boolean().optional() }, async (args) =>
    textResult(await handlers.delete_task(args))
  );
  server.tool(
    "create_project",
    {
      data_dir: z.string().optional(),
      title: z.string(),
      area: z.string().optional(),
      priority: z.string().optional(),
      source_links: z.array(z.string()).optional(),
      body: z.string().optional()
    },
    async (args) => textResult(await handlers.create_project(args))
  );
  server.tool("list_projects", { data_dir: z.string().optional() }, async (args) =>
    textResult(await handlers.list_projects(args))
  );
  server.tool("get_project", { data_dir: z.string().optional(), id: z.string() }, async (args) =>
    textResult(await handlers.get_project(args))
  );
  server.tool("link_source", { data_dir: z.string().optional(), id: z.string(), source_link: z.string() }, async (args) =>
    textResult(await handlers.link_source(args))
  );
  server.tool(
    "append_task_log",
    {
      data_dir: z.string().optional(),
      id: z.string(),
      message: z.string(),
      author: z.string().optional(),
      at: z.string().optional()
    },
    async (args) => textResult(await handlers.append_task_log(args))
  );
  server.tool(
    "sync_reminders",
    {
      data_dir: z.string().optional(),
      dry_run: z.boolean().optional(),
      list_name: z.string().optional()
    },
    async (args) => textResult(await handlers.sync_reminders(args))
  );

  server.resource("config", "action-ledger://config", async (uri) => ({
    contents: [{ uri: uri.href, text: JSON.stringify(await loadConfig(), null, 2) }]
  }));
  server.resource("tasks", "action-ledger://tasks", async (uri) => {
    const config = await loadConfig();
    return { contents: [{ uri: uri.href, text: JSON.stringify(await listTasks(config.data_dir), null, 2) }] };
  });
  server.resource("projects", "action-ledger://projects", async (uri) => {
    const config = await loadConfig();
    return { contents: [{ uri: uri.href, text: JSON.stringify(await listProjects(config.data_dir), null, 2) }] };
  });
  server.resource("task", new ResourceTemplate("action-ledger://task/{id}", { list: undefined }), async (uri, vars) => {
    const config = await loadConfig();
    return { contents: [{ uri: uri.href, text: JSON.stringify(await getTask(config.data_dir, String(vars.id)), null, 2) }] };
  });
  server.resource("project", new ResourceTemplate("action-ledger://project/{id}", { list: undefined }), async (uri, vars) => {
    const config = await loadConfig();
    return {
      contents: [{ uri: uri.href, text: JSON.stringify(await getProject(config.data_dir, String(vars.id)), null, 2) }]
    };
  });

  server.prompt("weekly_review", "Create a concise weekly review prompt for open tasks.", {}, () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Review open Action Ledger tasks, identify stale items, and suggest next actions."
        }
      }
    ]
  }));
  server.prompt("capture_project_plan", "Turn a planning discussion into a project and concrete tasks.", {}, () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Capture the current plan as an Action Ledger project. Create concrete tasks with area, priority, due date when available, source links, and a short body describing the expected outcome."
        }
      }
    ]
  }));
  server.prompt("create_study_followup", "Create a study follow-up task from a source or note.", {}, () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Create a learning task for the study material we just produced. Link the source note, choose the next practical action, set an appropriate due date if one was discussed, and enable Reminders only when the user asked to be notified."
        }
      }
    ]
  }));

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createCommandCenterMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
