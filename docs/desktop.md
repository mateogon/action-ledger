# Desktop App

The desktop app lives in `apps/desktop`.

It is a Tauri v2 + React + Vite app. The desktop layer reads and writes the same Markdown workspace as the CLI and MCP server.

## Scope

Implemented in the first desktop MVP:

- Kanban board for `inbox`, `next`, `doing`, `waiting`, and `done`.
- Workspace metrics.
- Filters for search, area, project, due-before date, and done visibility.
- Task creation.
- Drag/drop and select-based task moves.
- Collapsible lanes, with `Done` collapsed by default.
- Focus mode for a single lane.
- Card description preview from the task body.
- Detail modal with description, task log, sources, and actions.
- Mark done.
- Archive.
- Delete with browser confirmation.
- Open task files, source links, and the data folder.

Not implemented yet:

- Apple Reminders sync button inside the app.
- System tray.
- Autostart.
- Editing task logs directly in the app.
- Two-way Reminders import.
- Packaged installer and signing/notarization.

## Commands

```bash
npm run desktop:dev
npm run desktop:check
npm run desktop:build
```

The generated app bundle is:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Action Ledger.app
```

## Architecture Note

The current Tauri backend implements a small Rust bridge for the workspace file format. This keeps the app self-contained and avoids a background Node process. The CLI and MCP server still use `packages/core`.

This means the Markdown schema is now shared by convention and tests, not by a single runtime library. Before adding more desktop write operations, either:

1. keep the Rust bridge narrow and covered by fixture tests, or
2. extract the file-format contract into a generated schema shared by TypeScript and Rust.

## Lane Semantics

`Waiting` means blocked or waiting on someone/something else: external feedback, a decision, an approval, a reply, or a dependency. It is not a backlog lane.

## Task Log

Task logs are stored inside the task body:

```md
## Log

- 2026-05-17T10:00:00.000Z - Codex: Added detail modal and task log visibility.
```

Codex and other agents should append logs through MCP `append_task_log` or CLI `action-ledger task log`.
