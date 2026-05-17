#!/usr/bin/env node
import { runCli } from "../index.js";

const exitCode = await runCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`)
});

process.exit(exitCode);
