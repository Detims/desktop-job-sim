import type { DesktopPetBridge } from "../../preload/index.js";

declare global {
  interface Window {
    readonly desktopPet: DesktopPetBridge;
  }
}

export {};
