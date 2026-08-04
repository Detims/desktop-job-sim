import type { MemoryEntry, MemoryEntryDraft } from "./memory-types.js";

export function materializeMemory(
  draft: MemoryEntryDraft,
  now: number,
): MemoryEntry {
  return {
    ...draft,
    memoryId: globalThis.crypto.randomUUID(),
    occurredAt: now,
  };
}
