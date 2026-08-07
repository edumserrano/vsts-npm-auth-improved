import type { Key } from "node:readline";

/**
 * Controls real terminal prompts with queued text and keypress events. It waits
 * until a prompt can accept input and until rendering is stable. Cleanup removes
 * only the prompt listeners that this helper detects.
 */

type PromptOperation = () => void | Promise<void>;
type KeypressListener = (...args: any[]) => void;
type KeypressModifiers = Pick<Key, "ctrl" | "meta" | "shift">;

const initialKeypressListeners = new Set(currentKeypressListeners());
// Node installs its terminal-data bridge before the prompt input listener.
const promptListenerOffset = initialKeypressListeners.size === 0 ? 1 : 0;
const observedPromptListeners = new Set<KeypressListener>();

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
      emitKeypress("", "u", { ctrl: true });
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

  public acceptMultiselectValues(): this {
    this.operations.push(() => {
      emitKeypress("\r", "return");
    });
    return this;
  }

  public acceptSelectValue(): this {
    return this.submitText();
  }

  public cancel(): this {
    this.operations.push(() => {
      emitKeypress("\u001b", "escape");
    });
    return this;
  }

  /**
   * Runs test-owned setup while the current prompt stays open. Use this method
   * to repeat file-system changes between planning and file writes. It does not
   * import or mock application internals.
   */
  public performAsync(operation: () => Promise<void>): this {
    this.operations.push(operation);
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
        await operation();
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
    for (const listener of observedPromptListeners) {
      process.stdin.removeListener("keypress", listener);
    }
    observedPromptListeners.clear();
  }
}

function emitKeypress(
  sequence: string,
  name: string,
  modifiers: KeypressModifiers = {},
): void {
  process.stdin.emit("keypress", sequence, {
    name,
    sequence,
    ...modifiers,
  });
}

async function waitForPromptListenerAsync(): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const addedListeners = currentKeypressListeners().filter(
      listener => !initialKeypressListeners.has(listener),
    );
    const promptListeners = addedListeners.slice(promptListenerOffset);
    if (promptListeners.length > 0) {
      for (const listener of promptListeners) {
        observedPromptListeners.add(listener);
      }
      return;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 1));
  }

  throw new Error("Timed out waiting for a terminal prompt to accept input.");
}

async function waitForCompleteRenderAsync(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setTimeout(resolve, 10));
}

function currentKeypressListeners(): KeypressListener[] {
  return process.stdin.rawListeners("keypress") as KeypressListener[];
}
