# Architecture

Action Ledger is local-first and backend-first.

```text
Codex / agents
  -> MCP server
  -> packages/core
  -> Markdown workspace

CLI
  -> packages/core
  -> Markdown workspace

Future Tauri app
  -> packages/core
  -> Markdown workspace

Reminders sync
  -> packages/core
  -> Apple Reminders mirror
```

## Source of Truth

Markdown files with YAML frontmatter are the source of truth.

Apple Reminders is only a notification mirror. The desktop app is only a view/editor over the same files.

## Private Data

Private user data should live outside this repo, usually:

```text
~/Documents/Action Ledger/
```

This repo should only contain fake examples and code.

## Packages

- `packages/core`: workspace format, schemas, file operations.
- `packages/cli`: terminal interface over core.
- `packages/mcp-server`: MCP tools/resources over core.
- `packages/reminders-sync`: local-to-Apple-Reminders sync planning.
- `apps/desktop`: future Tauri UI.

## Safety Rules

- Mutations go through `packages/core`.
- Destructive operations require explicit confirmation.
- MCP does not execute arbitrary shell commands.
- Source links are stored as references, not copied.
