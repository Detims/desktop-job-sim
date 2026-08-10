import type { DesktopCharactersBridge } from "../../preload/characters.js";

declare global {
  interface Window {
    readonly desktopCharacters: DesktopCharactersBridge;
  }
}

export {};
