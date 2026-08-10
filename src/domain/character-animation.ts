import type {
  CharacterAnimationDefinition,
  CharacterAnimationState,
  CharacterPackManifest,
} from "../shared/character-types.js";
import type { Presentation } from "../shared/pet-types.js";

const PRESENTATION_STATE: Readonly<Record<Presentation, CharacterAnimationState>> = {
  dragged: "dragged",
  idle: "idle",
  ill: "ill",
  petted: "interaction",
  playing: "happy",
  resting: "sleep",
  studying: "study",
  walking: "walk",
  working: "work",
};

export function resolveCharacterAnimations(
  manifest: CharacterPackManifest,
): Record<CharacterAnimationState, CharacterAnimationDefinition> {
  return Object.fromEntries(
    Object.entries(manifest.fallbacks).map(([state, animationId]) => [
      state,
      manifest.animations[animationId]!,
    ]),
  ) as Record<CharacterAnimationState, CharacterAnimationDefinition>;
}

export function characterStateForPresentation(
  presentation: Presentation,
): CharacterAnimationState {
  return PRESENTATION_STATE[presentation];
}
