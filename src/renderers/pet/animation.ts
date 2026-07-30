import type { Presentation } from "../../shared/contracts.js";

const FALLBACKS: Readonly<Record<Presentation, readonly string[]>> =
  Object.freeze({
    dragged: ["dragged", "idle"],
    idle: ["idle"],
    petted: ["petted", "idle"],
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

