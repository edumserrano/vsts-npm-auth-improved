/**
 * Drives the real Clack prompts by queuing terminal input and keypress events.
 * The helper is awaitable and pauses for prompt redraws between operations so
 * interactive tests reproduce a user's input sequence reliably.
 */

type PromptOperation = () => unknown | Promise<unknown>;

export class PromptsInteraction {
  private operations: PromptOperation[] = [];

  public cancel(): this {
    this.operations.push(() => process.stdin.emit("keypress", "escape", { name: "escape" }));
    return this;
  }

  public clearText(): this {
    this.operations.push(() => process.stdin.emit("keypress", "", { name: "u", ctrl: true }));
    // Alternatively clear by sending backspaces
    //
    // for (let i = 0; i < <amount of backspaces>; i++) {
    //   this.operations.push(() => process.stdin.emit("keypress", "", { name: "backspace" }));
    // }
    return this;
  }

  public enterText(text: string): this {
    this.operations.push(() => process.stdin.emit("data", text));
    return this;
  }

  public replaceText(text: string): this {
    return this.clearText().enterText(text);
  }

  public submitText(): this {
    this.operations.push(() => process.stdin.emit("keypress", "\r", { name: "return" }));
    return this;
  }

  public up(): this {
    this.operations.push(() => process.stdin.emit("keypress", "", { name: "up" }));
    return this;
  }

  public down(): this {
    this.operations.push(() => process.stdin.emit("keypress", "", { name: "down" }));
    return this;
  }

  public acceptSelectOption(): this {
    this.operations.push(() => process.stdin.emit("keypress", "\r", { name: "return" }));
    return this;
  }

  // Make it awaitable - executes all queued operations sequentially
  // This is what allows to do await new PromptsInteraction().operation1().operation2();
  public async then<TResult = void>(
    onfulfilled?: ((value: void) => TResult | PromiseLike<TResult>) | null,
  ): Promise<TResult> {
    for (const operation of this.operations) {
      await operation();
      await PromptsInteraction.waitForNextRenderAsync(); // doesn't always need to happen, at least after submit it does but it's safer to always wait
    }
    return onfulfilled?.(undefined) as TResult;
  }

  private static async waitForNextRenderAsync(): Promise<typeof PromptsInteraction> {
    // you can use setImmediate or process.nextTick to trigger the next event loop cycle immediately. For promises, you can use:
    await new Promise(resolve => setImmediate(resolve));
    // // or
    // await Promise.resolve();
    // // or for multiple microtask cycles
    // await new Promise(resolve => process.nextTick(resolve));
    return PromptsInteraction;
  }
}
