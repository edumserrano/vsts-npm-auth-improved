import { expect } from "vitest";
import type { ExpectationResult } from "@vitest/expect";
import type { VstsNpmAuthMock } from "./vsts-npm-auth.js";

/**
 * Registers the Vitest matcher for the complete vsts-npm-auth process boundary.
 * It verifies the npx command, registry pin, executable arguments, and Execa options.
 */

interface CustomMatchers<R = unknown> {
  readonly toHaveBeenCalledWithVstsNpmAuthArgs: (
    vstsNpmAuthOptions: readonly string[],
  ) => R;
}

declare module "vitest" {
  interface Matchers<T = any> extends CustomMatchers<T> {}
}

expect.extend({
  toHaveBeenCalledWithVstsNpmAuthArgs(
    received: VstsNpmAuthMock,
    vstsNpmAuthOptions: readonly string[],
  ): ExpectationResult {
    const expectedArgs = [
      "npx",
      [
        "--yes",
        "--registry=https://registry.npmjs.org/",
        "vsts-npm-auth@latest",
        ...vstsNpmAuthOptions,
      ],
      {
        lines: true,
        all: true,
        reject: false,
      },
    ];

    const calls = received.mock.calls;
    const matchingCall = calls.find(call => this.equals(call, expectedArgs));

    if (matchingCall) {
      return {
        message: () =>
          `expected vsts-npm-auth mock not to have been called with args ${JSON.stringify(
            vstsNpmAuthOptions,
          )}\n\n${this.utils.printExpected(vstsNpmAuthOptions)}`,
        pass: true,
      };
    } else {
      const lastCall = calls[calls.length - 1];
      return {
        message: () =>
          `expected vsts-npm-auth mock to have been called with args ${JSON.stringify(
            vstsNpmAuthOptions,
          )}\n\n${this.utils.diff(expectedArgs, lastCall)}`,
        pass: false,
      };
    }
  },
});
