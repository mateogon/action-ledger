export class CommandCenterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CommandCenterError";
  }
}

export function asCommandCenterError(error: unknown): CommandCenterError {
  if (error instanceof CommandCenterError) return error;
  if (error instanceof Error) {
    return new CommandCenterError(error.message, "UNKNOWN", { cause: error });
  }
  return new CommandCenterError(String(error), "UNKNOWN");
}
