import type { DesktopSettingsBridge } from "../../preload/settings.js";

declare global {
  interface Window {
    readonly desktopSettings: DesktopSettingsBridge;
  }
}

export {};
