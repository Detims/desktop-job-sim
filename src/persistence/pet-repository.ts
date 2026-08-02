import type { PersistedPetRecord } from "../shared/pet-types.js";
import type { MeaningfulEvent } from "../shared/settings-activity-types.js";

export interface PetRepository {
  close(): void;
  load(): PersistedPetRecord | null;
  save(record: PersistedPetRecord, event?: MeaningfulEvent): void;
}
