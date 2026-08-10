export const CHARACTER_ANIMATION_STATES = [
  "idle",
  "walk",
  "sleep",
  "eat",
  "drink",
  "happy",
  "sad",
  "work",
  "study",
  "ill",
  "dragged",
  "interaction",
] as const;

export type CharacterAnimationState =
  (typeof CHARACTER_ANIMATION_STATES)[number];

export interface CharacterAnimationDefinition {
  fps: number;
  frames: number[];
  loop: boolean;
}

export interface CharacterPackManifest {
  animations: Record<string, CharacterAnimationDefinition>;
  canvas: {
    anchors: { feet: { x: number; y: number } };
    height: number;
    hitbox: { height: number; width: number; x: number; y: number };
    pivot: { x: number; y: number };
    width: number;
  };
  engineVersion: 1;
  fallbacks: Record<CharacterAnimationState, string>;
  id: string;
  metadata: {
    commercialUse: "allowed" | "disallowed" | "unknown";
    creator: string;
    description?: string | undefined;
    license: string;
    name: string;
    source: string;
    thirdPartyAssets: Array<{
      license: string;
      name: string;
      owner: string;
      source: string;
    }>;
  };
  schemaVersion: 1;
  spritesheet: {
    frameCount: number;
    frameHeight: number;
    frameWidth: number;
    path: string;
    scaleMode: "linear" | "nearest";
  };
  version: string;
}

export interface CharacterPackPreview {
  manifest: CharacterPackManifest;
  previewDataUrl: string;
  token: string;
  warnings: string[];
}

export interface CharacterPackSummary {
  builtIn: boolean;
  creator: string;
  id: string;
  license: string;
  name: string;
  version: string;
}

export interface CharacterLibrarySnapshot {
  activeAvailable: boolean;
  activePackId: string;
  packs: CharacterPackSummary[];
}

export interface CharacterVisual {
  animations: Record<CharacterAnimationState, CharacterAnimationDefinition>;
  assetUrl: string;
  canvas: CharacterPackManifest["canvas"];
  frameCount: number;
  frameHeight: number;
  frameWidth: number;
  packId: string;
  scaleMode: "linear" | "nearest";
  version: string;
}

export interface ApplyCharacterCommand {
  packId: string;
  type: "apply";
}

export interface InstallCharacterCommand {
  previewToken: string;
  type: "install";
}

export interface RemoveCharacterCommand {
  packId: string;
  type: "remove";
}

export type CharacterCommand =
  | ApplyCharacterCommand
  | InstallCharacterCommand
  | RemoveCharacterCommand;
