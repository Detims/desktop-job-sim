import { describe, expect, it } from "vitest";

import { SequentialCommandQueue } from "./command-queue.js";

describe("SequentialCommandQueue", () => {
  it("preserves command order across asynchronous work", async () => {
    const queue = new SequentialCommandQueue();
    const order: number[] = [];
    const first = queue.enqueue(async () => {
      await Promise.resolve();
      order.push(1);
    });
    const second = queue.enqueue(() => {
      order.push(2);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it("continues after a rejected command", async () => {
    const queue = new SequentialCommandQueue();
    const failed = queue.enqueue(() => {
      throw new Error("expected failure");
    });
    const recovered = queue.enqueue(() => "recovered");

    await expect(failed).rejects.toThrow("expected failure");
    await expect(recovered).resolves.toBe("recovered");
  });
});

