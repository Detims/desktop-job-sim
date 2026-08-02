import type {
  MeaningfulEvent,
  MeaningfulEventDraft,
} from "./settings-activity-types.js";

export function materializeEvent(
  draft: MeaningfulEventDraft,
  occurredAt: number,
): MeaningfulEvent {
  return {
    details: { ...(draft.details ?? {}) },
    eventId: globalThis.crypto.randomUUID(),
    occurredAt,
    retention: "standard",
    summary: draft.summary,
    type: draft.type,
    ...(draft.petId === undefined ? {} : { petId: draft.petId }),
  };
}
