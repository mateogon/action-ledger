# Security

Action Ledger stores private user tasks in a local workspace outside the repo.

## Data Safety

- Do not commit real workspaces.
- Do not copy source files into the workspace; store links only.
- Destructive MCP/CLI operations require explicit confirmation.
- The MCP server must not expose arbitrary shell execution.

## Apple Reminders

Apple Reminders sync is a mirror for due-date notifications. Markdown task files remain the source of truth.

Real sync currently uses AppleScript on macOS and may trigger macOS automation permissions.
