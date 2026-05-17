# Action Ledger - Implementation Plan

Status: desktop MVP implemented; packaging polish pending
Date: 2026-05-17

## Product Goal

Build a local-first command center for tasks, projects, reminders, and agent-managed plans.

The primary user interaction is through Codex or another agent via MCP. The visual app is a secondary interface for scanning, dragging cards, marking tasks done, and opening source links.

The system must be:

- local-first;
- test-driven;
- file-transparent;
- safe for private data;
- easy to initialize;
- usable by agents before the desktop UI exists;
- open-sourceable without shipping personal data.

## Core Principle

Backend first. UI last.

The first usable milestone is not a pretty Kanban. The first usable milestone is:

1. a reliable local workspace format;
2. a tested core library;
3. a CLI that can create, list, move, complete, archive, and delete tasks;
4. an MCP server that exposes the same operations to Codex;
5. optional Apple Reminders sync for due-date notifications.

Only after those are stable should the Tauri desktop UI be built.

## Repository Layout

```text
action-ledger/
  README.md
  IMPLEMENTATION_PLAN.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  apps/
    desktop/                 # Tauri + React, implemented last
  packages/
    core/                    # workspace, schema, task/project operations
    cli/                     # command-line interface
    mcp-server/              # MCP tools for Codex and agents
    reminders-sync/          # Apple Reminders integration
  examples/
    sample-workspace/        # fake demo data only
  docs/
    architecture.md
    workspace-format.md
    mcp-tools.md
    reminders-sync.md
```

## Private Data Layout

The public repo contains code and examples. Real user data lives outside the repo.

Default macOS workspace:

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

Global config:

```text
~/.action-ledger/config.yaml
```

Example:

```yaml
data_dir: ~/Documents/Action Ledger
reminders:
  enabled: false
  list_name: Action Ledger
desktop:
  autostart: false
```

## Data Model

### Task File

Each task is a Markdown file with YAML frontmatter.

```md
---
id: task_20260517_comunicacion_memo
title: Semana 1 - memo ejecutivo
area: learning
project: comunicacion-sistemas
status: next
priority: high
due: 2026-05-24
tags:
  - communication
  - study
reminder:
  enabled: true
  apple_id: null
source_links:
  - /Users/example/Documents/notes/communication-systems-study-plan.md
created_at: 2026-05-17T00:00:00-04:00
updated_at: 2026-05-17T00:00:00-04:00
---

## Objective

Write a SCQA memo about a real work system.

## Checklist

- [ ] Choose system
- [ ] Write memo
- [ ] Show it to someone
- [ ] Record feedback
```

### Project File

```md
---
id: project_comunicacion_sistemas
title: Comunicacion tecnica - sistemas complejos
area: learning
status: active
priority: high
source_links:
  - /Users/example/Documents/notes/communication-systems/
created_at: 2026-05-17T00:00:00-04:00
updated_at: 2026-05-17T00:00:00-04:00
---

## Purpose

Practice communicating complex systems through memos, diagrams, explanations, and feedback.
```

## Phase 0 - Product Decisions

Goal: lock the first version scope before writing implementation code.

Deliverables:

- `docs/architecture.md`
- `docs/workspace-format.md`
- `docs/mcp-tools.md`
- `docs/reminders-sync.md`

Decisions:

- Markdown frontmatter is the source of truth.
- Apple Reminders is a notification mirror, not the source of truth.
- The desktop app reads and writes the same files through `packages/core`.
- MCP tools call `packages/core`, not shell commands.
- Tauri UI is last.

Tests:

- Documentation has no private paths except clearly marked examples.
- Example workspace can be used in tests without touching real user data.

Exit criteria:

- Data model and status lifecycle are stable enough for implementation.

## Phase 1 - Core Workspace Library

Goal: create a tested library that can read, validate, and write the workspace.

Package:

```text
packages/core
```

Responsibilities:

- resolve global config;
- initialize workspace;
- parse task/project frontmatter;
- validate schema;
- generate stable IDs;
- create task files;
- update task files;
- move task across statuses;
- complete task;
- archive task;
- delete task;
- list tasks with filters;
- list projects;
- link source files;
- handle file conflicts safely.

Suggested stack:

- TypeScript;
- Vitest;
- `zod` for schemas;
- `gray-matter` for Markdown frontmatter;
- `yaml` if direct YAML handling is needed;
- `fs-extra` or native `fs/promises`.

Core tests:

- `initWorkspace` creates the expected directory tree.
- `initWorkspace` is idempotent.
- `loadConfig` resolves default and explicit paths.
- `createTask` writes a valid Markdown task.
- `createTask` rejects invalid status/area/priority.
- `listTasks` reads all lanes.
- `moveTask` changes status and file location.
- `moveTask` preserves body content.
- `completeTask` sets status `done` and completion timestamp.
- `archiveTask` moves task into archive.
- `deleteTask` supports safe delete only, with explicit confirmation flag.
- `linkSource` stores absolute source links.
- malformed frontmatter produces a useful error.

Exit criteria:

- `pnpm test --filter @action-ledger/core` passes.
- A sample workspace can be initialized and manipulated entirely through the core API.

## Phase 2 - CLI

Goal: make the system usable before MCP or UI.

Package:

```text
packages/cli
```

Commands:

```bash
action-ledger init
action-ledger doctor
action-ledger config get
action-ledger config set data_dir <path>
action-ledger task add "Title" --area learning --project comunicacion-sistemas --due 2026-05-24
action-ledger task list --status next --area learning
action-ledger task show <task_id>
action-ledger task move <task_id> doing
action-ledger task complete <task_id>
action-ledger task archive <task_id>
action-ledger task delete <task_id> --confirm
action-ledger project add "Project title" --area work
action-ledger project list
action-ledger open
```

Tests:

- CLI uses temporary workspace in tests.
- `action-ledger init` creates global config when requested.
- `action-ledger task add` creates a valid task.
- `action-ledger task move` updates status.
- `action-ledger task complete` marks task done.
- `action-ledger doctor` detects missing workspace.
- CLI output supports JSON mode for agents.

Exit criteria:

- All core operations are usable through CLI.
- Codex can manage tasks using terminal commands even without MCP.

## Phase 3 - MCP Server

Goal: expose task/project operations to Codex and other agents.

Package:

```text
packages/mcp-server
```

Use the official TypeScript MCP SDK.

Tools:

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
- `link_source`
- `sync_reminders`

Resources:

- `action-ledger://config`
- `action-ledger://tasks`
- `action-ledger://projects`
- `action-ledger://task/{id}`
- `action-ledger://project/{id}`

Prompts:

- `capture_project_plan`
- `create_study_followup`
- `weekly_review`

Security rules:

- MCP must only operate inside configured `data_dir`.
- `delete_task` requires explicit `confirm: true`.
- Source links can point outside `data_dir`, but must be stored as links, not copied.
- No arbitrary shell execution.
- No personal data in repo examples.

Tests:

- tool schemas validate inputs;
- tools call core API with temp workspace;
- list/create/move/complete roundtrip works;
- delete without `confirm` fails;
- paths outside `data_dir` cannot be mutated;
- resource reads return current task/project state.

Exit criteria:

- Codex can create, list, move, complete, and archive tasks through MCP.

## Phase 4 - Apple Reminders Sync

Goal: mirror dated tasks into Apple Reminders for notifications.

Package:

```text
packages/reminders-sync
```

Initial scope:

- one-way sync: local tasks -> Apple Reminders;
- create reminders for tasks where `reminder.enabled = true` and `due` exists;
- store `apple_id` back in task frontmatter;
- update title/due when local task changes;
- complete Apple Reminder when local task is done.

Later scope:

- two-way sync for completion;
- two-way sync for due date changes;
- recurring reminders;
- reminder lead times.

Implementation options:

1. Swift helper using EventKit.
2. Node wrapper that calls the Swift helper.
3. Fallback AppleScript only if EventKit helper is too much.

Tests:

- unit-test mapping between task and reminder payload;
- dry-run mode does not touch Apple Reminders;
- sync does not duplicate reminders when `apple_id` exists;
- completed local task completes remote reminder;
- missing remote reminder can be recreated safely;
- failures are reported per task, not fatal for all tasks.

Manual validation:

- create a test Reminders list;
- create one task due tomorrow;
- sync;
- confirm it appears in Apple Reminders;
- complete task locally;
- sync;
- confirm reminder is completed.

Exit criteria:

- local tasks with due dates reliably appear in Apple Reminders without duplicates.

## Phase 5 - Agent Workflow Fixtures

Goal: prove the system works with realistic Codex workflows.

Fixtures:

- study plan with six weekly tasks;
- movie watchlist item;
- work project task;
- personal admin task;
- task linked to an Obsidian note;
- task linked to a GitHub repo path.

Tests:

- import fixture workspace;
- list by area;
- list by project;
- list due soon;
- complete and archive;
- verify source links remain intact.

Agent scenarios:

1. "Add a reminder to study the communication docs next week."
2. "Move the memo task to doing."
3. "Mark the ADR task complete."
4. "Show me all learning tasks due this week."
5. "Create a project from this study plan and generate tasks."

Exit criteria:

- each scenario can be done by CLI and MCP.

## Phase 6 - Minimal Read-Only Web View

Goal: get visual feedback without committing to Tauri yet.

This phase is optional but useful before desktop packaging.

Implementation:

- simple Vite app under `apps/web-preview` or temporary route;
- reads fixture JSON generated by core or CLI;
- columns: Inbox, Next, Doing, Waiting, Done;
- filters: area, project, due soon;
- no drag/drop yet.

Tests:

- component tests render task cards;
- filters work;
- empty states render cleanly.

Exit criteria:

- visual model feels right before building Tauri.

## Phase 7 - Tauri Desktop App

Goal: packaged native-feeling app with low friction.

Package:

```text
apps/desktop
```

Features:

- Tauri + React;
- system tray;
- close-to-tray;
- optional autostart;
- Kanban columns;
- filters by area/project;
- drag/drop move task;
- mark done;
- archive/delete with confirmation;
- open source links;
- open data folder;
- show Reminders sync status.

Tests:

- UI unit tests for board rendering;
- integration test with temp workspace;
- drag/drop changes task status through core API;
- app can open with missing workspace and show setup;
- setup creates workspace;
- no personal data bundled in app.

Manual validation:

- install app locally;
- open app without terminal;
- create workspace from setup;
- create task through CLI/MCP;
- see task appear in app;
- drag task to Doing;
- verify file changed;
- complete task in app;
- verify CLI sees status done.

Exit criteria:

- the app is useful as a visual dashboard and light editor.

## Phase 8 - Open Source Readiness

Goal: make the repo publishable.

Deliverables:

- README with product explanation;
- install instructions;
- MCP setup instructions;
- CLI examples;
- screenshots or demo GIFs;
- sample workspace;
- license;
- contribution guide;
- privacy model;
- security notes for MCP.

Checks:

- no private paths in committed examples except fake sample paths;
- no real task data;
- fresh clone can run tests;
- fresh clone can initialize sample workspace;
- package names are consistent;
- docs explain code/data separation.

Exit criteria:

- repo can be pushed public without leaking private data.

## First MVP Definition

The first MVP is complete when:

- `action-ledger init` creates a workspace;
- `action-ledger task add/list/move/complete/archive` work;
- MCP exposes the same operations;
- tests cover all core operations;
- a real task can be created for a study plan;
- optional dry-run Reminders sync can show what would be created.

Tauri is not part of the first MVP.

## First Real User Story

Input:

> Add a task reminding me to do Week 1 of the communication systems study plan by next Sunday, link it to the plan note, and make it show up in Apple Reminders.

Expected behavior:

1. Agent calls MCP `create_task`.
2. Core writes task Markdown into `tasks/next/`.
3. Agent calls `sync_reminders`.
4. Reminders sync creates native reminder.
5. `list_tasks` shows the task.
6. Later, user says task is done.
7. Agent calls `complete_task`.
8. Local file moves to `done/`.
9. Apple Reminder is marked completed on next sync.

## Implementation Order

1. Create repo skeleton.
2. Add tooling: npm workspaces, TypeScript, Vitest.
3. Implement `packages/core`.
4. Add core tests.
5. Implement `packages/cli`.
6. Add CLI tests.
7. Implement MCP server.
8. Add MCP tests.
9. Add fixture workflows.
10. Implement Reminders dry-run.
11. Implement real Apple Reminders sync.
12. Add read-only board preview if useful.
13. Implement Tauri desktop app.
14. Add packaging and open-source docs.

## Risk Register

| Risk | Mitigation |
| --- | --- |
| File format changes break existing tasks | Version frontmatter with `schema_version` before public release |
| Apple Reminders duplicates | Store `apple_id`, use deterministic external ID in notes, add dry-run |
| MCP server can mutate wrong files | Restrict writes to configured `data_dir` |
| UI and CLI disagree | Both must use `packages/core` |
| User stops trusting system because it hides state | Keep Markdown transparent and human-readable |
| Building UI too early slows backend | Tauri is explicitly Phase 7 |

## Validation Commands

Current validation commands:

```bash
npm install
npm test
npm run typecheck
npm run build
node packages/cli/dist/bin/action-ledger.js init --data-dir "$HOME/Documents/Action Ledger"
node packages/cli/dist/bin/action-ledger.js doctor
```

## Current Next Step

The backend MVP has enough coverage for real use through CLI and MCP. The next phase should be UI work only after the backend behavior remains stable in normal use:

1. add a minimal read-only board preview if visual validation is needed;
2. implement the Tauri desktop app;
3. add screenshots/demo GIFs after the UI exists.
