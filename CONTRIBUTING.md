# Contributing

Action Ledger is backend-first.

Before UI work, keep these packages reliable:

- `packages/core`
- `packages/cli`
- `packages/mcp-server`
- `packages/reminders-sync`

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Rules

- Do not commit private task data.
- Keep examples fake.
- Put mutations through `packages/core`.
- Add tests for every task/project/reminders behavior change.
- Keep Tauri UI work separate from backend correctness.
