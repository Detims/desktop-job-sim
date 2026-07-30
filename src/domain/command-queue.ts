export class SequentialCommandQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(command: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(command);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

