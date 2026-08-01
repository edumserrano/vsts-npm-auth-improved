export type DirectorySearchFailure = {
  readonly type: "directory-search-failed";
  readonly directoryPath: string;
  readonly cause: unknown;
};

export type FileReadFailure = {
  readonly type: "file-read-failed";
  readonly displayPath: string;
  readonly cause: unknown;
};

export type InvalidPackageJsonFailure = {
  readonly type: "invalid-package-json";
  readonly displayPath: string;
  readonly issue: "invalid-json" | "root-not-object";
  readonly cause?: unknown;
};

export type FileWriteFailure = {
  readonly type: "file-write-failed";
  readonly displayPath: string;
  readonly cause: unknown;
};

export type InitAuthFailure =
  | DirectorySearchFailure
  | FileReadFailure
  | InvalidPackageJsonFailure
  | FileWriteFailure;

export function formatInitAuthFailure(failure: InitAuthFailure): string {
  switch (failure.type) {
    case "directory-search-failed":
      return withFinalPeriod(
        `Could not search ${formatDisplayPath(failure.directoryPath)}: ${formatCause(failure.cause)}`,
      );
    case "file-read-failed":
      return withFinalPeriod(
        `Could not read ${failure.displayPath}: ${formatCause(failure.cause)}`,
      );
    case "invalid-package-json":
      if (failure.issue === "invalid-json") {
        return withFinalPeriod(
          `Could not configure ${failure.displayPath}: the file contains invalid JSON: ${formatCause(failure.cause)}`,
        );
      }
      return `Could not configure ${failure.displayPath}: the top-level JSON value must be an object.`;
    case "file-write-failed":
      return withFinalPeriod(
        `Could not write ${failure.displayPath}: ${formatCause(failure.cause)}`,
      );
    default: {
      const never: never = failure;
      throw new Error(`Unhandled init-auth failure: ${JSON.stringify(never)}`);
    }
  }
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim() !== "") {
    return cause.message;
  }

  const detail = String(cause).trim();
  return detail === "" ? "the operation failed without an error message" : detail;
}

function formatDisplayPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function withFinalPeriod(message: string): string {
  return /[.!?]$/.test(message) ? message : `${message}.`;
}
