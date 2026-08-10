import type {
  CharacterRegistryRecord,
  InstalledCharacterPackRecord,
} from "../shared/character-types.js";
import type { MeaningfulEvent } from "../shared/settings-activity-types.js";

export interface CharacterRegistryRepository {
  loadCharacterRegistry(): CharacterRegistryRecord;
  removeInstalledCharacter(packId: string, event: MeaningfulEvent): void;
  saveInstalledCharacter(
    pack: InstalledCharacterPackRecord,
    event: MeaningfulEvent,
  ): void;
  setActiveCharacter(packId: string, event: MeaningfulEvent): void;
}
