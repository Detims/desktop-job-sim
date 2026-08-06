import type { Presentation } from "../../shared/contracts.js";

const FALLBACKS: Readonly<Record<Presentation, readonly string[]>> =
  Object.freeze({
    dragged: ["dragged", "idle"],
    idle: ["idle"],
    ill: ["ill", "idle"],
    petted: ["petted", "idle"],
    playing: ["petted", "idle"],
    resting: ["resting", "idle"],
    studying: ["studying", "working", "idle"],
    walking: ["walking", "idle"],
    working: ["working", "idle"],
  });

export function resolveAnimation(
  presentation: Presentation,
  availableAnimations: ReadonlySet<string>,
): string {
  const resolved = FALLBACKS[presentation].find((animation) =>
    availableAnimations.has(animation),
  );

  return resolved ?? "static";
}
