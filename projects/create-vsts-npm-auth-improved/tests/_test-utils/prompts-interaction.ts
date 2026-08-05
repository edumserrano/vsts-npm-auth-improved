/**
 * Drives the real Clack terminal listeners with queued text and keypress events,
 * waiting for attachment and complete rendering around each interaction. Cleanup
 * removes only Clack listeners created after the test process was initialized.
 */

type PromptOperation = () => void;

const trackedStdinEvents = ["data", "keypress"] as const;
const initialListeners = new Map(
  trackedStdinEvents.map(eventName => [
    eventName,
    process.stdin.rawListeners(eventName),
  ]),
);

export class PromptsInteraction implements PromiseLike<void> {
  private readonly operations: PromptOperation[] = [];

  public enterText(text: string): this {
    this.operations.push(() => {
      process.stdin.emit("data", text);
    });
    return this;
  }

  public clearText(): this {
    this.operations.push(() => {
      process.stdin.emit("keypress", "", { name: "u", ctrl: true });
    });
    return this;
  }

  public replaceText(text: string): this {
    return this.clearText().enterText(text);
  }

  public submitText(): this {
    this.operations.push(() => {
      emitKeypress("\r", "return");
    });
    return this;
  }

  public up(): this {
    this.operations.push(() => {
      emitKeypress("", "up");
    });
    return this;
  }

  public down(): this {
    this.operations.push(() => {
      emitKeypress("", "down");
    });
    return this;
  }

  public toggleMultiselectItem(): this {
    this.operations.push(() => {
      emitKeypress(" ", "space");
    });
    return this;
  }

  public acceptSelectOption(): this {
    this.operations.push(() => {
      emitKeypress("\r", "return");
    });
    return this;
  }

  public acceptMultiselectValues(): this {
    this.operations.push(() => {
      emitKeypress("\r", "return");
    });
    return this;
  }

  public cancel(): this {
    this.operations.push(() => {
      emitKeypress("\u001b", "escape");
    });
    return this;
  }

  public async then<TResult1 = void, TResult2 = never>(
    onfulfilled?:
      | ((value: void) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    try {
      for (const operation of this.operations) {
        await waitForPromptListenerAsync();
        operation();
        await waitForCompleteRenderAsync();
      }

      return onfulfilled?.(undefined) as TResult1;
    } catch (error) {
      if (onrejected !== undefined && onrejected !== null) {
        return onrejected(error);
      }
      throw error;
    }
  }

  public static resetPromptListeners(): void {
    for (const eventName of trackedStdinEvents) {
      const expectedListeners = initialListeners.get(eventName) ?? [];
      for (const listener of process.stdin.rawListeners(eventName)) {
        if (
          !expectedListeners.includes(listener) &&
          isClackPromptListener(eventName, listener)
        ) {
          process.stdin.removeListener(
            eventName,
            listener as (...args: any[]) => void,
          );
        }
      }
    }
  }
}

function emitKeypress(sequence: string, name: string): void {
  process.stdin.emit("keypress", sequence, { name, sequence });
}

async function waitForPromptListenerAsync(): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const promptListenerAttached = process.stdin
      .rawListeners("keypress")
      .some(listener => isClackPromptListener("keypress", listener));
    if (promptListenerAttached) {
      return;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 1));
  }

  throw new Error("Timed out waiting for the Clack prompt to accept input.");
}

async function waitForCompleteRenderAsync(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setTimeout(resolve, 10));
}

function isClackPromptListener(
  eventName: (typeof trackedStdinEvents)[number],
  listener: Function,
): boolean {
  return eventName === "keypress" && listener.name === "bound onKeypress";
}
