import type { PersistedPetRecord } from "../shared/pet-types.js";

export interface PetRepository {
  close(): void;
  load(): PersistedPetRecord | null;
  save(record: PersistedPetRecord): void;
}
