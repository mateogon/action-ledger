# Action Ledger

Action Ledger is a local-first task and project system designed to be managed by agents.

The core idea is simple: keep the source of truth as Markdown/YAML files on your machine, then let Codex, Claude, or any MCP-capable agent create tasks, update state, append logs, link sources, and keep a clean action trail. The desktop app is a lightweight Kanban view over the same files, not a separate database.

## Why This Exists

AI agents are useful at creating plans, research notes, study guides, project folders, and follow-up work. The problem is that the resulting work can get scattered across repos, note vaults, documents, chats, and reminders.

Action Ledger gives agents one durable place to register:

- what needs to be done;
- which project or area it belongs to;
- what source file, note, repo, or document created the task;
- what changed over time through a task log;
- whether it is inbox, next, doing, waiting, or done;
- whether Apple Reminders should mirror the task for notifications.

Private task data lives outside this public repo. This repository contains only code and fake examples.

## Current Status

Implemented:

- Markdown/YAML workspace format.
- Core task and project operations.
- CLI for local automation.
- MCP server for Codex, Claude, and other agents.
- Apple Reminders dry-run and real macOS sync.
- Tauri desktop dashboard with Kanban lanes, card descriptions, task logs, source links, collapsible lanes, focused lane view, and `Done` collapsed by default.

Not yet implemented:

- In-app editing of task logs.
- System tray and autostart.
- Two-way Apple Reminders import.
- Signed/notarized installer.

## Install From Source

Requirements:

- Node.js 18.20 or newer.
- npm.
- macOS for the Tauri app and Apple Reminders sync.
- Rust + Cargo only if you want to build the desktop app.

```bash
git clone https://github.com/mateogon/action-ledger.git
cd action-ledger
npm install
npm run build
```

Optional: expose the CLI globally from this checkout.

```bash
npm link --workspace @action-ledger/cli
action-ledger --help
```

`acc` is also kept as a short CLI alias.

## Initialize A Workspace

Create your private local workspace:

```bash
action-ledger init --data-dir "$HOME/Documents/Action Ledger"
```

That creates:

```text
~/Documents/Action Ledger/
  config.yaml
  tasks/
    inbox/
    next/
    doing/
    waiting/
    done/
  projects/
  archive/
  templates/
```

The global config is stored at:

```text
~/.action-ledger/config.yaml
```

Existing older local installs that used `~/.agent-command-center/config.yaml` are still read as a fallback.

## CLI Usage

If you ran `npm link`:

```bash
action-ledger task add "Write system memo" --area learning --status next --due 2026-05-24
action-ledger task list --status next --due-before 2026-05-31
action-ledger task log <task_id> "Captured the implementation decision" --author Codex
action-ledger task move <task_id> doing
action-ledger task complete <task_id>
action-ledger reminders sync --json
```

Without global linking, use the repo script:

```bash
npm run cli -- task list --status next
```

## MCP Server

Build first:

```bash
npm run build:packages
```

Then run the MCP server:

```bash
npm run mcp
```

### Codex MCP Setup

Recommended setup with Codex CLI:

```bash
codex mcp add action-ledger -- node /absolute/path/to/action-ledger/packages/mcp-server/dist/bin/acc-mcp.js
codex mcp list
```

For this local checkout:

```bash
codex mcp add action-ledger -- node /Users/mateo/Developer/agent-command-center/packages/mcp-server/dist/bin/acc-mcp.js
codex mcp list
```

Or add this manually to `~/.codex/config.toml`:

```toml
[mcp_servers.action-ledger]
command = "node"
args = ["/absolute/path/to/action-ledger/packages/mcp-server/dist/bin/acc-mcp.js"]
```

For this local checkout, the path is:

```toml
[mcp_servers.action-ledger]
command = "node"
args = ["/Users/mateo/Developer/agent-command-center/packages/mcp-server/dist/bin/acc-mcp.js"]
```

Restart Codex after editing the config so the MCP server is loaded. Once loaded, ask Codex to use the `action-ledger` MCP tools to create tasks, list tasks, move tasks, link sources, or append task logs.

### Claude Desktop MCP Setup

For Claude Desktop or other JSON-based MCP clients, configure the server like this:

```json
{
  "mcpServers": {
    "action-ledger": {
      "command": "node",
      "args": ["/absolute/path/to/action-ledger/packages/mcp-server/dist/bin/acc-mcp.js"]
    }
  }
}
```

Main MCP tools:

- `init_workspace`
- `get_workspace_status`
- `create_task`
- `list_tasks`
- `get_task`
- `move_task`
- `complete_task`
- `archive_task`
- `delete_task`
- `create_project`
- `list_projects`
- `get_project`
- `link_source`
- `append_task_log`
- `sync_reminders`

The most important agent behavior is to use `append_task_log` as work evolves. That turns a task from a static todo into an auditable action record.

The MCP server also ships with agent instructions: agents should suggest tasks for substantial study/research outputs, curated lists, or plans worth revisiting, but should not create tasks automatically unless the user explicitly asks to create, register, track, remind, or schedule them.

See [docs/mcp-tools.md](docs/mcp-tools.md) for tool names, resources, prompts, and safety notes.

## Desktop App

Development:

```bash
npm run desktop:dev
```

Build the macOS app bundle:

```bash
npm run desktop:build
open "apps/desktop/src-tauri/target/release/bundle/macos/Action Ledger.app"
```

After a local build, this convenience command opens the bundle:

```bash
npm run desktop:open
```

The desktop app reads the same Markdown workspace as the CLI and MCP server.

## Apple Reminders

Apple Reminders is a notification mirror, not the source of truth.

Dry-run:

```bash
action-ledger reminders sync --json
```

Real macOS sync:

```bash
action-ledger reminders sync --real --list-name "Action Ledger" --json
```

Real sync may trigger macOS automation permission prompts.

## Workspace Model

Task files are Markdown with YAML frontmatter:

```md
---
schema_version: 1
id: task_20260517090000_write-system-memo
title: Write system memo
area: learning
project: communication-systems
status: next
priority: high
due: 2026-05-24
tags:
  - study
reminder:
  enabled: true
  apple_id: null
source_links:
  - /path/to/source.md
created_at: 2026-05-17T09:00:00.000Z
updated_at: 2026-05-17T09:00:00.000Z
completed_at: null
archived_at: null
---

## Objective

Write a one-page memo that explains the system, tradeoffs, and next decision.

## Log

- 2026-05-17T10:00:00.000Z - Codex: Created the task from a study plan.
```

See [docs/workspace-format.md](docs/workspace-format.md) for the full format.

## Sample Workspace

The public fixture lives at:

```text
examples/sample-workspace/
```

It includes fake learning, work, media, and admin tasks so tests and demos can exercise realistic agent workflows without shipping personal data.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm run desktop:rust:test
npm run desktop:build
npm audit --omit=dev
```

## Safety

- Do not commit real workspaces.
- Keep private data outside the repo.
- Source links are stored as references, not copied.
- Destructive CLI/MCP operations require explicit confirmation.
- The MCP server does not expose arbitrary shell execution.
