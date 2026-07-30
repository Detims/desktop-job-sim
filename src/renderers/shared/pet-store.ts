import {
  PetPatchSchema,
  PetSnapshotSchema,
  PetStateSchema,
  type PetPatch,
  type PetSnapshot,
  type PetState,
} from "../../shared/contracts.js";

export function readSnapshot(input: unknown): PetState {
  return PetSnapshotSchema.parse(input).state;
}

export function applyPatch(
  state: PetState,
  input: PetPatch | unknown,
): PetState | null {
  const patch = PetPatchSchema.parse(input);

  if (patch.baseVersion !== state.stateVersion) {
    return null;
  }

  return PetStateSchema.parse({
    ...state,
    ...patch.changes,
    stateVersion: patch.nextVersion,
  });
}

export function makeSnapshot(state: PetState): PetSnapshot {
  return PetSnapshotSchema.parse({ state });
}
