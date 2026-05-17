# Apple Reminders Sync

Apple Reminders is a notification mirror, not the source of truth.

## Current Scope

Implemented:

- dry-run planning for local tasks;
- create/update/complete action planning;
- duplicate prevention model through `reminder.apple_id`.
- real macOS sync through an AppleScript Reminders provider;
- local task frontmatter is updated with the created `apple_id`;
- completing a local task completes the mirrored Apple Reminder on sync.

Not implemented yet:

- two-way completion sync;
- due-date edits from Apple Reminders back to local tasks.
- Swift/EventKit provider.

## Action Rules

For every task:

- if `reminder.enabled` is false, no action;
- if `due` is missing, no action;
- if task is open and `apple_id` is null, plan `create`;
- if task is open and `apple_id` exists, plan `update`;
- if task is done and `apple_id` exists, plan `complete`.

## Real Sync Direction

The first real implementation uses AppleScript because it is small, transparent, and works in a packaged or CLI environment without building a native helper.

The future preferred implementation is a small Swift EventKit helper called by the TypeScript package. EventKit should replace AppleScript only when it provides better reliability without making installation heavier.

## CLI

Dry-run:

```bash
action-ledger reminders sync --json
```

Real macOS sync:

```bash
action-ledger reminders sync --real --list-name "Action Ledger" --json
```

Real sync creates the Reminders list if it does not exist.

## Manual Validation

This was validated on macOS with a temporary list:

1. initialize a temporary workspace;
2. create a dated task with `reminder.enabled = true`;
3. run `action-ledger reminders sync --real --list-name "Action Ledger Codex Real Sync Test"`;
4. verify `apple_id` is written back to the task;
5. verify the reminder exists in Apple Reminders;
6. complete the task locally;
7. sync again;
8. verify the Apple Reminder is completed;
9. delete the temporary Reminders list.
