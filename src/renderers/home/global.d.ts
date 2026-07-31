import type { DesktopHomeBridge } from "../../preload/home.js";

declare global {
  interface Window {
    readonly desktopHome: DesktopHomeBridge;
  }
}

export {};
