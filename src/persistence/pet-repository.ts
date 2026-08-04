import type { PersistedPetRecord } from "../shared/pet-types.js";
import type { MeaningfulEvent } from "../shared/settings-activity-types.js";
import type { MemoryEntry } from "../shared/memory-types.js";

export interface PetRepository {
  close(): void;
  load(): PersistedPetRecord | null;
  save(
    record: PersistedPetRecord,
    events?: readonly MeaningfulEvent[],
    memories?: readonly MemoryEntry[],
  ): void;
}
