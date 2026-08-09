import type { DesktopCommerceBridge } from "../../preload/commerce.js";

declare global {
  interface Window {
    readonly desktopCommerce: DesktopCommerceBridge;
  }
}

export {};
