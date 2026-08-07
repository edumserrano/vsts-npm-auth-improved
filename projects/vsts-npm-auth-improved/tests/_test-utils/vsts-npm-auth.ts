import { ExecaMethod } from "execa";
import { MockedFunction, vi } from "vitest";
import { execa } from "execa";

/**
 * Controls the Execa mock boundary for vsts-npm-auth. It converts typed results
 * into representative process output and supplies exact call counts. Tests do
 * not start the real authentication process or contact Azure.
 */

type MockVstsNpmAuthResult =
  | "credentials-not-required"
  | "already-have-credentials"
  | "could-not-get-auth-token"
  | "no-registry-entry-found"
  | "config-file-not-found"
  | "credentials-obtained"
  | "unknown";

export type MockVstsNpmAuthOptions =
  | MockVstsNpmAuthResult
  | readonly MockVstsNpmAuthResult[];

export type VstsNpmAuthMock = MockedFunction<ExecaMethod<{}>> & {
  readonly callCount: number;
};

export function mockVstsNpmAuth(options: MockVstsNpmAuthOptions): VstsNpmAuthMock {
  const mock: MockedFunction<ExecaMethod<{}>> = vi.mocked(execa);
  const expectedVstsNpmAuthResults = Array.isArray(options) ? options : [options];
  for (const vstsNpmAuthResults of expectedVstsNpmAuthResults) {
    mock.mockResolvedValueOnce({
      all: getVstsNpmAuthOutputForResult(vstsNpmAuthResults),
    } as any);
  }

  const augmentedMock = mock as VstsNpmAuthMock;
  Object.defineProperty(augmentedMock, "callCount", {
    get: function () {
      return this.mock.calls.length;
    },
    configurable: true,
  });
  return augmentedMock;
}

function getVstsNpmAuthOutputForResult(result: MockVstsNpmAuthResult): string[] {
  const headerOutputLines = ["", "vsts-npm-auth v0.43.0.0 ", "-----------------------"];
  const commandOutputLines: string[] = [];
  switch (result) {
    case "credentials-not-required": {
      // Empty output after the headers starts this case in parseResult.
      break;
    }
    case "already-have-credentials": {
      commandOutputLines.push("Already have credentials for");
      break;
    }
    case "could-not-get-auth-token": {
      commandOutputLines.push("Couldn't get an authentication token for");
      break;
    }
    case "no-registry-entry-found": {
      commandOutputLines.push("No registry entries were found in the supplied config files");
      break;
    }
    case "config-file-not-found": {
      commandOutputLines.push("Config file not found");
      break;
    }
    case "credentials-obtained": {
      commandOutputLines.push("Getting new credentials for");
      break;
    }
    case "unknown": {
      commandOutputLines.push("Some unexpected output");
      break;
    }
    default: {
      const never: never = result;
      throw new Error(`Unhandled mock vsts-npm-auth result: ${never}`);
    }
  }

  return [...headerOutputLines, ...commandOutputLines];
}
